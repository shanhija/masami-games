/**
 * The belts' slot engine: each case alone (a run queueing at a dead end, a join's turns, a
 * fork's alternation, loops full and with a gap, forks on full loops, a bridge's two lanes,
 * mouths and spouts in turn, towers and bowls taking from under them, a sitting muncher, the
 * stamps the picture and the hint read, the graph), then a property test over thousands of
 * small random networks: things conserved, never two in a slot and never a move of two
 * slots, none stuck with room ahead, the same moves in any walk order, and the same as a slow
 * reference that moves one thing at a time until nothing changes under the same turn rules.
 */
import { describe, expect, it } from 'vitest'

import { add, cell, emptyBoard, line, put, read } from './beltKit'
import { cellOf, dirTo, stepCell } from './board'
import { BOWL_HOLD, HOLD, PART_INFO, STACK, TOWER_AMMO } from './catalog'
import { hop, hopInOrder, rebuild, runOf } from './belts'
import { CELLS, OVER, PARTS, PRED, SLOTS, THINGS, inSlot, outSlot, overIn, overOut, thingIndex, type Dir, type Kind, type Muncher, type State, type Thing } from './model'
import { rng } from './random'
import { building, give, pushHead, take, takeUnder, wants, wantsUnder } from './trade'

const sitter = (id: number, c: number): Muncher => ({
  id,
  burrow: 0,
  mode: 'sit',
  modeAt: 0,
  cell: c,
  toward: c,
  stepAt: 0,
  stepFor: 0,
  hop: null,
  homeWhy: null,
  target: { kind: 'cell', cell: c },
  tried: [],
  cheeks: [],
  grabAt: -1,
  idleSince: 0,
  outAt: 0,
  scout: false,
  shotBy: -1,
})
/** A lane's slots in riding order, cell by cell. */
const lane = (cells: readonly number[]) => cells.flatMap((c) => [inSlot(c), outSlot(c)])
/** A closed loop through neighbouring cells: each comes in from the one before and leaves toward the one after, the last back into the first. */
function loop(s: State, path: readonly (readonly [number, number])[]): number[] {
  const cells = line(s, path)
  const first = cells[0]!
  const last = cells[cells.length - 1]!
  s.belts.in[first] = dirTo(first, last)
  s.belts.out[last] = dirTo(last, first)
  return cells
}
/** Everything there is of each thing: on the belts, inside buildings, in the rocket. */
function census(s: State): number[] {
  const n = THINGS.map(() => 0)
  for (const v of s.belts.slot) if (v >= 0) n[v]!++
  for (const b of s.buildings) {
    b.held.forEach((k, i) => (n[i]! += k))
    for (const t of [...b.queue, ...b.stack]) n[thingIndex(t)]!++
  }
  PARTS.forEach((p, i) => (n[thingIndex(PART_INFO[p].thing)]! += s.rocket.got[i]!))
  return n
}

describe('a belt', () => {
  it('moves things one slot a hop and queues them nose to tail at a dead end', () => {
    const s = emptyBoard()
    const cells = line(s, [[2, 3], [3, 3], [4, 3], [5, 3]])
    rebuild(s)
    const slots = lane(cells)
    for (const x of slots.slice(0, 3)) put(s, x, 'blueRock')
    hop(s)
    expect(read(s, slots).join(' ')).toBe('. blueRock blueRock blueRock . . . .')
    expect(s.belts.from[slots[1]!]).toBe(slots[0])
    for (let i = 0; i < 6; i++) hop(s)
    expect(read(s, slots).join(' ')).toBe('. . . . . blueRock blueRock blueRock')
    // Standing still: each thing was where it is, the chevrons stop on the full cells and run on the empty ones, and the end cell is stamped blocked.
    expect(s.belts.from[slots[7]!]).toBe(slots[7])
    const moved = Array.from(s.belts.moved.subarray(0, CELLS)).filter((_, c) => cells.includes(c))
    s.tick = 100
    s.belts.blockedSince.fill(-1)
    hop(s)
    expect(Array.from(cells, (c) => s.belts.moved[c]! - moved[cells.indexOf(c)]!)).toEqual([1, 1, 0, 0])
    expect(s.belts.blockedSince[cells[3]!]).toBe(100)
    s.tick = 120
    hop(s)
    expect(s.belts.blockedSince[cells[3]!]).toBe(100)
    expect(s.belts.blockedSince[cells[2]!]).toBe(-1)
  })

  it('follows a bend as drawn', () => {
    const s = emptyBoard()
    const cells = line(s, [[2, 3], [3, 3], [3, 4], [3, 5]])
    rebuild(s)
    expect(s.belts.in[cells[1]!]).toBe(2)
    expect(s.belts.out[cells[1]!]).toBe(1)
    put(s, outSlot(cells[0]!), 'gear')
    hop(s)
    hop(s)
    expect(read(s, [outSlot(cells[1]!)])).toEqual(['gear'])
  })

  it('takes turns at a join: its own in slot first, then the side', () => {
    const s = emptyBoard()
    const main = line(s, [[2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3], [9, 3]])
    const side = line(s, [[4, 0], [4, 1], [4, 2]])
    s.belts.out[side[2]!] = 1
    rebuild(s)
    const join = main[2]!
    expect(Array.from(s.net.preds.subarray(PRED * outSlot(join), PRED * outSlot(join) + PRED))).toEqual([inSlot(join), outSlot(side[2]!), -1])
    for (const x of [...lane(main.slice(0, 2)), inSlot(join)]) put(s, x, 'blueRock')
    for (const x of lane(side)) put(s, x, 'goldRock')
    const seen: string[] = []
    for (let i = 0; i < 6; i++) {
      hop(s)
      seen.push(read(s, [outSlot(join)])[0]!)
    }
    expect(seen).toEqual(['blueRock', 'goldRock', 'blueRock', 'goldRock', 'blueRock', 'goldRock'])
  })

  it('forks by turns, and sends everything one way while the other is full', () => {
    const s = emptyBoard()
    const main = line(s, [[2, 5], [3, 5], [4, 5], [5, 5], [6, 5], [7, 5], [8, 5], [9, 5], [10, 5], [11, 5]])
    const branch = line(s, [[4, 6], [4, 7]])
    s.belts.fork[main[2]!] = 1
    rebuild(s)
    expect(s.net.next2[outSlot(main[2]!)]).toBe(inSlot(branch[0]!))
    const things: Thing[] = ['blueBar', 'goldBar', 'gear', 'greenBottle', 'orangeBottle', 'bubble']
    lane(main.slice(0, 3)).forEach((x, i) => put(s, x, things[i]!))
    const went: string[] = []
    for (let i = 0; i < 12; i++) {
      const before = read(s, [outSlot(main[2]!)])[0]!
      hop(s)
      if (before !== '.') went.push(read(s, [inSlot(main[3]!)])[0] === before ? 'on' : 'side')
    }
    // The thing at the fork's end first goes on (forkTurn 0), then they alternate.
    expect(went).toEqual(['on', 'side', 'on', 'side', 'on', 'side'])
    // A full side: everything goes straight on.
    const t = emptyBoard()
    const m = line(t, [[2, 5], [3, 5], [4, 5], [5, 5], [6, 5], [7, 5], [8, 5], [9, 5], [10, 5], [11, 5], [12, 5]])
    const b = [cell(t, 4, 6, 3, 1, -1, -1)]
    t.belts.fork[m[2]!] = 1
    t.belts.forkTurn[m[2]!] = 1
    rebuild(t)
    put(t, inSlot(b[0]!), 'gear')
    put(t, outSlot(b[0]!), 'gear')
    for (const x of lane(m.slice(0, 3))) put(t, x, 'blueBar')
    for (let i = 0; i < 10; i++) hop(t)
    expect(read(t, lane(b))).toEqual(['gear', 'gear'])
    expect(read(t, lane(m)).filter((x) => x === 'blueBar').length).toBe(6)
  })
})

describe('a loop', () => {
  const ring: readonly (readonly [number, number])[] = [[2, 2], [3, 2], [4, 2], [4, 3], [4, 4], [3, 4], [2, 4], [2, 3]]

  it('stands still when full and turns whole with a gap', () => {
    const s = emptyBoard()
    const cells = loop(s, ring)
    rebuild(s)
    const slots = lane(cells)
    slots.forEach((x, i) => put(s, x, THINGS[i % THINGS.length]!))
    const before = read(s, slots)
    hop(s)
    expect(read(s, slots)).toEqual(before)
    expect(slots.every((x) => s.belts.from[x] === x)).toBe(true)
    s.belts.slot[slots[5]!] = -1
    const gap = read(s, slots)
    hop(s)
    // Every thing moved one slot on, and the gap with them.
    const after = read(s, slots)
    for (let i = 0; i < slots.length; i++) if (gap[i] !== '.') expect(after[(i + 1) % slots.length]).toBe(gap[i])
    expect(after[6]).toBe('.')
  })

  it('with a fork on it sends things out when full', () => {
    const s = emptyBoard()
    const cells = loop(s, ring)
    const out = line(s, [[3, 1], [3, 0]])
    s.belts.out[out[0]!] = 3
    s.belts.in[out[0]!] = 1
    s.belts.out[out[1]!] = 3
    s.belts.in[out[1]!] = 1
    s.belts.fork[cellOf(3, 2)] = 3
    rebuild(s)
    const slots = lane(cells)
    slots.forEach((x) => put(s, x, 'gear'))
    hop(s)
    expect(read(s, [inSlot(out[0]!)])).toEqual(['gear'])
    // The loop moved round behind the fork, leaving its one gap just past it.
    expect(read(s, slots).filter((x) => x === '.').length).toBe(1)
    expect(read(s, [inSlot(cellOf(4, 2))])).toEqual(['.'])
  })

  it('with two forks on it, full: the fork on the lowest cell sends out and the other goes round', () => {
    const s = emptyBoard()
    const cells = loop(s, ring)
    const top = line(s, [[3, 1], [3, 0]])
    for (const c of top) {
      s.belts.in[c] = 1
      s.belts.out[c] = 3
    }
    const bottom = line(s, [[3, 5], [3, 6]])
    s.belts.fork[cellOf(3, 2)] = 3
    s.belts.fork[cellOf(3, 4)] = 1
    rebuild(s)
    const slots = lane(cells)
    slots.forEach((x) => put(s, x, 'gear'))
    const t = structuredClone(s)
    hop(s)
    expect(read(s, [inSlot(top[0]!), inSlot(bottom[0]!)])).toEqual(['gear', '.'])
    expect(s.belts.forkTurn[cellOf(3, 2)]).toBe(0)
    expect(s.belts.forkTurn[cellOf(3, 4)]).toBe(1)
    // The same whatever the walk's order.
    const walk = Array.from({ length: SLOTS }, (_, i) => SLOTS - 1 - i)
    hopInOrder(t, walk)
    expect(read(t, [...slots, inSlot(top[0]!), inSlot(bottom[0]!)])).toEqual(read(s, [...slots, inSlot(top[0]!), inSlot(bottom[0]!)]))
  })
})

describe('a bridge', () => {
  it('carries both lanes across one cell', () => {
    const s = emptyBoard()
    const across = line(s, [[2, 5], [3, 5], [4, 5], [5, 5], [6, 5]])
    const down = line(s, [[4, 3], [4, 4], [4, 5], [4, 6], [4, 7]])
    const bridge = cellOf(4, 5)
    cell(s, 4, 5, 2, 0, -1, 1)
    rebuild(s)
    expect(across[2]).toBe(bridge)
    expect(down[2]).toBe(bridge)
    expect(s.net.next[outSlot(down[1]!)]).toBe(overIn(bridge))
    expect(s.net.next[overOut(bridge)]).toBe(inSlot(down[3]!))
    expect(s.net.next[outSlot(across[1]!)]).toBe(inSlot(bridge))
    put(s, outSlot(across[1]!), 'blueBar')
    put(s, outSlot(down[1]!), 'bubble')
    hop(s)
    expect(read(s, [inSlot(bridge), overIn(bridge)])).toEqual(['blueBar', 'bubble'])
    hop(s)
    hop(s)
    expect(read(s, [inSlot(across[3]!), inSlot(down[3]!)])).toEqual(['blueBar', 'bubble'])
  })
})

describe('buildings and belts', () => {
  it('lists mouths and spouts round the footprint clockwise from its top-left', () => {
    const s = emptyBoard()
    const b = add(s, 'workshop', 6, 4)
    cell(s, 6, 3, 3, 1, -1, -1)
    cell(s, 8, 5, 0, 2, -1, -1)
    cell(s, 5, 5, 2, 0, -1, -1)
    cell(s, 5, 4, 2, 0, -1, -1)
    cell(s, 7, 6, 3, 1, -1, -1)
    cell(s, 8, 4, 2, 0, -1, -1)
    rebuild(s)
    expect(s.net.mouths.get(b.id)).toEqual([outSlot(cellOf(6, 3)), outSlot(cellOf(8, 5)), outSlot(cellOf(5, 5)), outSlot(cellOf(5, 4))])
    expect(s.net.spouts.get(b.id)).toEqual([inSlot(cellOf(8, 4)), inSlot(cellOf(7, 6))])
    expect(s.net.next[outSlot(cellOf(6, 3))]).toBe(-2 - b.id)
  })

  it('takes from mouths in turn, room counted thing by thing, and leaves what it does not want', () => {
    const s = emptyBoard()
    const w = add(s, 'workshop', 6, 4)
    const upper = line(s, [[3, 4], [4, 4], [5, 4]])
    const lower = line(s, [[3, 5], [4, 5], [5, 5]])
    rebuild(s)
    expect(s.net.mouths.get(w.id)).toEqual([outSlot(lower[2]!), outSlot(upper[2]!)])
    for (const x of lane([upper[1]!, upper[2]!, lower[1]!, lower[2]!])) put(s, x, 'blueBar')
    w.held[thingIndex('blueBar')] = HOLD - 1
    const count = (cells: number[]) => read(s, lane(cells)).filter((x) => x !== '.').length
    const from: string[] = []
    for (let i = 0; i < 4; i++) {
      const was = count(lower)
      hop(s)
      from.push(count(lower) < was ? 'lower' : 'upper')
      expect(w.held[thingIndex('blueBar')]).toBe(HOLD)
      w.held[thingIndex('blueBar')] = HOLD - 1
    }
    expect(from).toEqual(['lower', 'upper', 'lower', 'upper'])
    expect(s.events.filter((e) => e.kind === 'gulp').length).toBe(4)
    // With room for two, it takes from both mouths in one hop.
    w.held[thingIndex('blueBar')] = HOLD - 2
    put(s, outSlot(lower[2]!), 'blueBar')
    put(s, outSlot(upper[2]!), 'blueBar')
    hop(s)
    expect(w.held[thingIndex('blueBar')]).toBe(HOLD)
    // A gold bar it never takes waits at the mouth.
    w.held[thingIndex('blueBar')] = 0
    s.belts.slot.fill(-1)
    put(s, outSlot(upper[2]!), 'goldBar')
    hop(s)
    expect(read(s, [outSlot(upper[2]!)])).toEqual(['goldBar'])
  })

  it('pushes the stack onto free spouts in turn, skipping full ones', () => {
    const s = emptyBoard()
    const o = add(s, 'oven', 6, 4)
    const a = line(s, [[8, 4], [9, 4], [10, 4]])
    const b = line(s, [[8, 5], [9, 5], [10, 5]])
    rebuild(s)
    expect(s.net.spouts.get(o.id)).toEqual([inSlot(a[0]!), inSlot(b[0]!)])
    o.stack = ['blueBar', 'goldBar', 'blueBar']
    hop(s)
    expect(read(s, [inSlot(a[0]!), inSlot(b[0]!)])).toEqual(['blueBar', 'goldBar'])
    expect(o.stack).toEqual(['blueBar'])
    expect(o.outTurn).toBe(0)
    expect(s.belts.from[inSlot(a[0]!)]).toBe(-1)
    // A pushed thing waits for the next hop, and its spout is full until it has moved on: then the stack's last goes to the spout whose turn it is.
    hop(s)
    expect(read(s, [inSlot(a[0]!), outSlot(a[0]!), inSlot(b[0]!), outSlot(b[0]!)])).toEqual(['.', 'blueBar', '.', 'goldBar'])
    expect(o.stack).toEqual(['blueBar'])
    hop(s)
    expect(read(s, [inSlot(a[0]!), inSlot(b[0]!)])).toEqual(['blueBar', '.'])
    expect(o.outTurn).toBe(1)
    // A full spout is skipped: the turn goes on to the next.
    s.belts.slot.fill(-1)
    for (const x of lane(b)) put(s, x, 'gear')
    o.stack = ['goldBar', 'goldBar']
    hop(s)
    expect(read(s, [inSlot(a[0]!), inSlot(b[0]!)])).toEqual(['goldBar', 'gear'])
    expect(o.stack).toEqual(['goldBar'])
    expect(o.outTurn).toBe(1)
  })

  it('fills the rocket from the pad mouth, and stops a machine a muncher naps on', () => {
    const s = emptyBoard()
    const pad = add(s, 'pad', 1, 4)
    const belt = line(s, [[6, 5], [5, 5], [4, 5]])
    rebuild(s)
    s.rocket.got[0] = PART_INFO.legs.n - 1
    put(s, outSlot(belt[2]!), 'blueBar')
    put(s, inSlot(belt[2]!), 'blueBar')
    hop(s)
    expect(s.rocket.got[0]).toBe(PART_INFO.legs.n)
    expect(s.events.map((e) => e.kind)).toEqual(['fill', 'partFull'])
    hop(s)
    // The legs are full and the body is not open yet: the next bar waits.
    expect(read(s, [outSlot(belt[2]!)])).toEqual(['blueBar'])
    expect(wants(s, pad, 'gear')).toBe(false)
    const t = emptyBoard()
    const w = add(t, 'workshop', 6, 4)
    const into = line(t, [[4, 4], [5, 4]])
    const away = line(t, [[8, 5], [9, 5]])
    rebuild(t)
    put(t, outSlot(into[1]!), 'blueBar')
    w.stack = ['gear']
    w.napper = 7
    hop(t)
    expect(read(t, [outSlot(into[1]!), inSlot(away[0]!)])).toEqual(['blueBar', '.'])
    expect(w.stack).toEqual(['gear'])
  })

  it('lets a tower take bubbles while it has room for two shots, and a bowl gold bars below BOWL_HOLD', () => {
    const s = emptyBoard()
    const belt = line(s, [[2, 7], [3, 7], [4, 7], [5, 7], [6, 7], [7, 7], [8, 7], [9, 7]])
    const tower = add(s, 'tower', 5, 7)
    rebuild(s)
    expect(s.owner[belt[3]!]).toBe(tower.id)
    expect(s.net.mouths.get(tower.id)).toEqual([])
    for (const x of lane(belt.slice(0, 3))) put(s, x, 'bubble')
    for (let i = 0; i < 12; i++) hop(s)
    expect(tower.ammo).toBe(TOWER_AMMO)
    expect(tower.held[thingIndex('bubble')]).toBe(2)
    expect(read(s, lane(belt)).filter((x) => x === 'bubble').length).toBe(4)
    const t = emptyBoard()
    const row = line(t, [[2, 7], [3, 7], [4, 7], [5, 7], [6, 7], [7, 7], [8, 7]])
    const bowl = add(t, 'bowl', 4, 7)
    rebuild(t)
    for (const x of lane(row.slice(0, 3))) put(t, x, 'goldBar')
    put(t, outSlot(row[1]!), 'blueBar')
    for (let i = 0; i < 12; i++) hop(t)
    expect(bowl.held[thingIndex('goldBar')]).toBe(BOWL_HOLD)
    expect(read(t, lane(row)).filter((x) => x !== '.').sort()).toEqual(['blueBar', 'goldBar'])
  })

  it('stops at a cell a muncher sits on: nothing leaves it and nothing enters it', () => {
    const s = emptyBoard()
    const belt = line(s, [[2, 3], [3, 3], [4, 3], [5, 3], [6, 3]])
    rebuild(s)
    s.munchers = [sitter(1, belt[2]!)]
    put(s, outSlot(belt[2]!), 'greenBottle')
    put(s, outSlot(belt[1]!), 'greenBottle')
    put(s, inSlot(belt[1]!), 'greenBottle')
    const moved = s.belts.moved[belt[2]!]
    for (let i = 0; i < 4; i++) hop(s)
    expect(read(s, lane(belt)).join(' ')).toBe('. . greenBottle greenBottle . greenBottle . . . .')
    expect(s.belts.moved[belt[2]!]).toBe(moved)
  })
})

describe('the graph', () => {
  it('lists a join cell feeders in turn order: its own in slot, then the side joins clockwise from its in side', () => {
    const s = emptyBoard()
    line(s, [[2, 5], [3, 5], [4, 5], [5, 5]])
    cell(s, 4, 4, 3, 1, -1, -1)
    cell(s, 4, 6, 1, 3, -1, -1)
    rebuild(s)
    const j = cellOf(4, 5)
    expect(Array.from(s.net.preds.subarray(PRED * outSlot(j), PRED * outSlot(j) + PRED))).toEqual([inSlot(j), outSlot(cellOf(4, 4)), outSlot(cellOf(4, 6))])
    // A bend takes no side join, and a fork's out never lands as one; a fork's side goes only into a belt that starts there.
    s.belts.fork[cellOf(3, 5)] = 1
    cell(s, 3, 6, 3, 0, -1, -1)
    cell(s, 2, 6, 2, 0, 3, -1)
    rebuild(s)
    expect(s.net.next2[outSlot(cellOf(3, 5))]).toBe(inSlot(cellOf(3, 6)))
    expect(s.net.next[outSlot(cellOf(2, 6))]).toBe(-1)
    expect(s.net.next2[outSlot(cellOf(2, 6))]).toBe(-1)
    expect(s.net.next[outSlot(cellOf(3, 6))]).toBe(outSlot(cellOf(4, 6)))
    cell(s, 1, 5, 2, 0, 1, -1)
    rebuild(s)
    expect(s.net.next[outSlot(cellOf(1, 5))]).toBe(inSlot(cellOf(2, 5)))
    cell(s, 1, 5, 1, 3, -1, -1)
    cell(s, 0, 5, 2, 0, 3, -1)
    rebuild(s)
    expect(s.net.next[outSlot(cellOf(0, 5))]).toBe(-1)
  })

  it('makes a dead end of a head-on pair, a bend side and the edge', () => {
    const s = emptyBoard()
    cell(s, 2, 2, 2, 0, -1, -1)
    cell(s, 3, 2, 0, 2, -1, -1)
    cell(s, 5, 2, 1, 2, -1, -1)
    cell(s, 6, 2, 0, 2, -1, -1)
    cell(s, 19, 2, 2, 0, -1, -1)
    rebuild(s)
    expect(s.net.next[outSlot(cellOf(2, 2))]).toBe(-1)
    expect(s.net.next[outSlot(cellOf(3, 2))]).toBe(-1)
    expect(s.net.next[outSlot(cellOf(6, 2))]).toBe(-1)
    expect(s.net.next[outSlot(cellOf(19, 2))]).toBe(-1)
  })

  it('gives a run up to the next fork, join or building', () => {
    const s = emptyBoard()
    const main = line(s, [[2, 5], [3, 5], [4, 5], [5, 5], [6, 5], [7, 5], [8, 5], [9, 5]])
    s.belts.fork[main[2]!] = 1
    const branch = line(s, [[4, 6], [4, 7], [4, 8]])
    const joiner = line(s, [[7, 2], [7, 3], [7, 4]])
    rebuild(s)
    expect(runOf(s, main[0]!)).toEqual(main.slice(0, 2))
    expect(runOf(s, main[4]!)).toEqual(main.slice(3, 5))
    expect(runOf(s, main[2]!)).toEqual([main[2]])
    expect(runOf(s, main[5]!)).toEqual([main[5]])
    expect(runOf(s, branch[1]!)).toEqual(branch)
    expect(runOf(s, joiner[0]!)).toEqual(joiner)
    add(s, 'workshop', 10, 5)
    rebuild(s)
    expect(runOf(s, main[7]!)).toEqual(main.slice(6))
    // A loop with no fork, join or building is one run all round.
    const t = emptyBoard()
    const ring = loop(t, [[2, 2], [3, 2], [3, 3], [2, 3]])
    rebuild(t)
    expect(runOf(t, ring[2]!).sort()).toEqual([...ring].sort())
  })
})

// ---------------------------------------------------------------------------------------
// Random networks and the slow reference

// The tests' module runner reads every import through a getter, too slow for the loops below: they read these copies.
const nSlots = SLOTS
const nCells = CELLS
const nPred = PRED
const overAt = OVER
const cellAt = (x: number) => (x >> 1) % nCells

/** The slow reference: the same rules, but one thing moves at a time (any that can, in passes of random order) until nothing changes; then the fork on the lowest cell whose other way is free goes that way, and so on. */
function slowHop(s: State, rand: () => number): void {
  const { belts, net } = s
  const sat = new Set(s.munchers.filter((m) => m.mode === 'sit').map((m) => m.cell))
  const still = (x: number) => sat.has(cellAt(x))
  const snap = Array.from(belts.slot)
  for (const b of s.buildings) {
    const spouts = net.spouts.get(b.id)!
    const start = b.outTurn
    spouts.forEach((_, i) => {
      const j = (start + i) % spouts.length
      const x = spouts[j]!
      if (pushHead(b) === null || belts.slot[x]! >= 0 || still(x)) return
      belts.slot[x] = thingIndex(give(s, b))
      b.outTurn = (j + 1) % spouts.length
    })
  }
  const cur = Array.from(belts.slot)
  const gone = new Map<number, number>()
  const isFork = (x: number) => x < overAt && x % 2 === 1 && belts.fork[cellAt(x)]! >= 0
  const pref = (x: number) => (isFork(x) && belts.forkTurn[cellAt(x)] === 1 ? net.next2[x]! : net.next[x]!)
  const otherWay = (x: number) => (belts.forkTurn[cellAt(x)] === 1 ? net.next[x]! : net.next2[x]!)
  const into = (x: number) => {
    gone.set(x, -2)
    cur[x] = -1
  }
  for (const b of s.buildings) {
    if (b.kind !== 'tower' && b.kind !== 'bowl') continue
    const c = cellOf(b.x, b.y)
    const x = [2 * c + 1, 2 * c].find((y) => snap[y]! >= 0 && !still(y) && wantsUnder(b, THINGS[snap[y]!]!))
    if (x === undefined) continue
    takeUnder(s, b, THINGS[snap[x]!]!)
    into(x)
  }
  for (const b of s.buildings) {
    const mouths = net.mouths.get(b.id)!
    const start = b.inTurn
    mouths.forEach((_, i) => {
      const j = (start + i) % mouths.length
      const x = mouths[j]!
      if (snap[x]! < 0 || still(x) || gone.has(x) || pref(x) !== -2 - b.id || !wants(s, b, THINGS[snap[x]!]!)) return
      take(s, b, THINGS[snap[x]!]!)
      into(x)
      b.inTurn = (j + 1) % mouths.length
    })
  }
  const feeders = (y: number) => Array.from(net.preds.subarray(nPred * y, nPred * y + nPred)).filter((p) => p >= 0)
  const winnerOf = new Map<number, number>()
  for (let y = 0; y < nSlots; y++) {
    if (net.preds[nPred * y]! < 0) continue
    const f = feeders(y)
    const start = f.length > 0 && y < overAt && y % 2 === 1 ? belts.joinTurn[cellAt(y)]! % f.length : 0
    const w = [...f.slice(start), ...f.slice(0, start)].find((p) => snap[p]! >= 0 && !still(p) && !gone.has(p))
    if (w !== undefined) winnerOf.set(y, w)
  }
  const held = snap.flatMap((v, x) => (v >= 0 ? [x] : []))
  const waiting = () => held.filter((x) => !gone.has(x) && !still(x))
  for (;;) {
    // Passes in a random order, each thing that can move moving at once, until a pass moves nothing.
    let progress = false
    const order = waiting()
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      const swap = order[i]!
      order[i] = order[j]!
      order[j] = swap
    }
    for (const x of order) {
      const y = pref(x)
      if (y < 0 || cur[y]! >= 0 || still(y) || winnerOf.get(y) !== x) continue
      cur[y] = snap[x]!
      cur[x] = -1
      gone.set(x, y)
      progress = true
    }
    if (progress) continue
    const fork = waiting()
      .filter(isFork)
      .find((x) => {
        const y = otherWay(x)
        return (y >= 0 && cur[y]! < 0 && !still(y)) || (y <= -2 && wants(s, building(s, -2 - y), THINGS[snap[x]!]!))
      })
    if (fork === undefined) break
    const y = otherWay(fork)
    if (y >= 0) cur[y] = snap[fork]!
    else take(s, building(s, -2 - y), THINGS[snap[fork]!]!)
    cur[fork] = -1
    gone.set(fork, y >= 0 ? y : -2)
  }
  belts.slot.set(cur)
  belts.from.fill(-1)
  for (let x = 0; x < nSlots; x++) {
    if (snap[x]! < 0) continue
    const y = gone.get(x)
    if (y === undefined) {
      belts.from[x] = x
      continue
    }
    if (y >= 0) belts.from[y] = x
    if (isFork(x)) belts.forkTurn[cellAt(x)] = y >= 0 && y === net.next2[x] ? 0 : 1
    const f = y >= 0 ? feeders(y) : []
    if (y >= 0 && y < overAt && y % 2 === 1 && f.length > 1) belts.joinTurn[cellAt(y)] = (f.indexOf(x) + 1) % f.length
  }
  const stayed = (x: number) => snap[x]! >= 0 && !gone.has(x)
  for (let c = 0; c < nCells; c++) {
    if (belts.out[c]! < 0) continue
    if (!sat.has(c) && ![2 * c, 2 * c + 1, overAt + 2 * c, overAt + 2 * c + 1].some(stayed)) belts.moved[c]!++
    belts.blockedSince[c] = stayed(2 * c + 1) && belts.slot[2 * c]! >= 0 ? (belts.blockedSince[c]! >= 0 ? belts.blockedSince[c]! : s.tick) : -1
    const hump = nCells + c
    belts.blockedSince[hump] = belts.over[c]! >= 0 && stayed(overAt + 2 * c + 1) && belts.slot[overAt + 2 * c]! >= 0 ? (belts.blockedSince[hump]! >= 0 ? belts.blockedSince[hump]! : s.tick) : -1
  }
}

/** A small random network in a window of the board: buildings with things inside, snaking belts, loops, joins, forks, bridges, towers and bowls on the belt, things on most slots, munchers sitting on a few cells. Cells are written as they come, so head-on pairs and dead ends turn up too. */
function randomNet(seed: number): State {
  const r = rng(seed)
  const int = (n: number) => Math.floor(r() * n)
  const pick = <T>(xs: readonly T[]) => xs[int(xs.length)]!
  const s = emptyBoard()
  s.tick = 200
  if (r() < 0.5) s.found = ['digger', 'gold', 'science', 'gears']
  const X0 = 2
  const Y0 = 2
  const W = 4 + int(4)
  const H = 3 + int(4)
  const inside = (x: number, y: number) => x >= X0 && x < X0 + W && y >= Y0 && y < Y0 + H
  const taken = new Set<number>()
  // Buildings first, with things in them.
  for (let k = int(3); k > 0; k--) {
    const kind = pick<Kind>(['oven', 'workshop', 'greenMaker', 'orangeMaker', 'lab', 'pad', 'digger', 'pump'])
    const size = kind === 'pad' ? 3 : 2
    const x = X0 + int(W)
    const y = Y0 + int(H)
    const cells: number[] = []
    for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) cells.push(cellOf(x + dx, y + dy))
    if (cells.some((c) => taken.has(c))) continue
    for (const c of cells) taken.add(c)
    const b = add(s, kind, x, y)
    b.held = b.held.map(() => int(HOLD + 1))
    if (kind === 'oven') b.queue = Array.from({ length: int(HOLD + 1) }, () => pick<Thing>(['blueRock', 'goldRock']))
    b.stack = Array.from({ length: int(STACK + 1) }, () => pick(THINGS))
    b.inTurn = int(4)
    b.outTurn = int(4)
    if (r() < 0.1) b.napper = 9
  }
  const free = (c: number) => c >= 0 && !taken.has(c) && s.belts.out[c]! < 0 && inside(c % 20, Math.floor(c / 20))
  // Snaking belts: random walks, some closing into loops, ends pointing anywhere.
  for (let k = 2 + int(4); k > 0; k--) {
    let c = cellOf(X0 + int(W), Y0 + int(H))
    if (!free(c)) continue
    const path = [c]
    for (let n = 1 + int(9); n > 0; n--) {
      const nexts = ([0, 1, 2, 3] as Dir[]).map((d) => stepCell(c, d)).filter((m) => free(m) && !path.includes(m))
      if (nexts.length === 0) break
      c = pick(nexts)
      path.push(c)
    }
    path.forEach((c, i) => {
      const out = i + 1 < path.length ? dirTo(c, path[i + 1]!) : (int(4) as Dir)
      const inSide = i > 0 ? dirTo(c, path[i - 1]!) : (((out + 1 + int(3)) % 4) as Dir)
      s.belts.in[c] = inSide
      s.belts.out[c] = inSide === out ? ((out + 2) % 4) : out
    })
    const first = path[0]!
    const last = path[path.length - 1]!
    const close = ([0, 1, 2, 3] as Dir[]).find((d) => stepCell(last, d) === first)
    if (path.length >= 4 && close !== undefined && r() < 0.7) {
      s.belts.out[last] = close
      s.belts.in[first] = (close + 2) % 4
    }
    for (const c of path) taken.add(c)
  }
  // A few lone cells pointing anywhere.
  for (let k = int(5); k > 0; k--) {
    const c = cellOf(X0 + int(W), Y0 + int(H))
    if (!free(c)) continue
    const i = int(4)
    s.belts.in[c] = i
    s.belts.out[c] = (i + 1 + int(3)) % 4
  }
  // Forks and bridges on straight cells, towers and bowls on plain and bending ones.
  for (let c = 0; c < nCells; c++) {
    const b = s.belts
    if (b.out[c]! < 0) continue
    const straight = b.in[c] === (b.out[c]! + 2) % 4
    const side = ((b.out[c]! + (r() < 0.5 ? 1 : 3)) % 4) as Dir
    if (straight && r() < 0.25) b.fork[c] = side
    else if (straight && r() < 0.2) b.over[c] = side
    else if (r() < 0.1) add(s, r() < 0.5 ? 'tower' : 'bowl', c % 20, Math.floor(c / 20))
    b.joinTurn[c] = int(3)
    b.forkTurn[c] = int(2)
  }
  for (const b of s.buildings) {
    if (b.kind === 'tower') {
      b.ammo = int(TOWER_AMMO + 1)
      b.held[thingIndex('bubble')] = Math.ceil(b.ammo / 2)
    }
  }
  rebuild(s)
  // Things on most slots, and a muncher or two sitting.
  for (let x = 0; x < nSlots; x++) {
    const c = cellAt(x)
    const there = x >= overAt ? s.belts.over[c]! >= 0 : s.belts.out[c]! >= 0
    if (there && r() < 0.6) put(s, x, r() < 0.5 ? pick(['bubble', 'goldBar', 'blueBar'] as const) : pick(THINGS))
  }
  const belts = Array.from({ length: nCells }, (_, c) => c).filter((c) => s.belts.out[c]! >= 0)
  for (let k = int(3); k > 0 && belts.length > 0; k--) s.munchers.push(sitter(k, pick(belts)))
  return s
}

/** Whether two hops from one state decided the same: every belt array, the buildings, the rocket and the events. */
function same(a: State, b: State): boolean {
  const lanes = (s: State) => [s.belts.slot, s.belts.from, s.belts.joinTurn, s.belts.forkTurn, s.belts.moved, s.belts.blockedSince]
  const bl = lanes(b)
  const al = lanes(a)
  for (let k = 0; k < al.length; k++) for (let i = 0; i < al[k]!.length; i++) if (al[k]![i] !== bl[k]![i]) return false
  return JSON.stringify([a.buildings, a.rocket, a.events]) === JSON.stringify([b.buildings, b.rocket, b.events])
}
/** A copy for one hop: everything a hop writes is copied, and the slot graph it only reads is shared. */
const forHop = (s: State): State => ({ ...s, belts: structuredClone(s.belts), buildings: structuredClone(s.buildings), rocket: structuredClone(s.rocket), events: [] })

/** Everything wrong with one hop from `before` to `after`, as short notes. */
function lintHop(before: State, after: State): string[] {
  const bad: string[] = []
  const { net } = before
  const was = before.belts.slot
  const now = after.belts.slot
  const from = after.belts.from
  if (census(before).join() !== census(after).join()) bad.push(`census ${census(before)} became ${census(after)}`)
  const sat = new Set(before.munchers.filter((m) => m.mode === 'sit').map((m) => m.cell))
  const spouts = new Set([...net.spouts.values()].flat())
  const sources = new Set<number>()
  for (let y = 0; y < nSlots; y++) {
    if (now[y]! < 0) {
      if (from[y] !== -1) bad.push(`empty slot ${y} came from ${from[y]}`)
      continue
    }
    const x = from[y]!
    if (x === -1) {
      if (was[y]! >= 0 || !spouts.has(y)) bad.push(`slot ${y} filled from nowhere`)
    } else if (x === y) {
      if (was[y] !== now[y]) bad.push(`slot ${y} stood still but changed`)
    } else {
      if (net.next[x] !== y && net.next2[x] !== y) bad.push(`slot ${x} jumped to ${y}`)
      if (was[x] !== now[y]) bad.push(`slot ${y} holds what ${x} did not`)
      if (sources.has(x)) bad.push(`slot ${x} went two ways`)
      if (sat.has(cellAt(x)) || sat.has(cellAt(y))) bad.push(`a move ${x} to ${y} through a sitting muncher`)
      sources.add(x)
    }
  }
  // None stuck with room ahead: a thing that stood still has every way it could go full (or a muncher sits there), or the building there does not want it.
  for (let x = 0; x < nSlots; x++) {
    if (was[x]! < 0 || from[x] !== x || sat.has(cellAt(x))) continue
    const under = after.buildings.find((b) => (b.kind === 'tower' || b.kind === 'bowl') && cellOf(b.x, b.y) === cellAt(x))
    if (under !== undefined && wantsUnder(under, THINGS[was[x]!]!) && !after.events.some((e) => e.kind === 'gulp' && e.id === under.id)) bad.push(`the ${under.kind} on ${cellAt(x)} left a thing it wants`)
    for (const y of [net.next[x]!, net.next2[x]!]) {
      if (y >= 0 && now[y]! < 0 && !sat.has(cellAt(y))) bad.push(`slot ${x} stuck with ${y} empty ahead`)
      if (y <= -2 && wants(after, building(after, -2 - y), THINGS[was[x]!]!)) bad.push(`slot ${x} stuck at a mouth that wants it`)
    }
  }
  return bad
}

describe('random networks', () => {
  const NETS = 2000
  const HOPS = 4
  it(`keep every rule and agree with the slow reference and with any walk order on ${NETS} networks`, { timeout: 30_000 }, () => {
    const bad: string[] = []
    let moves = 0
    let fallbacks = 0
    for (let seed = 1; seed <= NETS && bad.length < 10; seed++) {
      let s = randomNet(seed)
      const r = rng(seed * 7919)
      for (let k = 0; k < HOPS; k++) {
        s.events = []
        const fast = forHop(s)
        hop(fast)
        const slow = forHop(s)
        slowHop(slow, r)
        const walk = Array.from({ length: nSlots }, (_, i) => i)
        for (let i = walk.length - 1; i > 0; i--) {
          const j = Math.floor(r() * (i + 1))
          const swap = walk[i]!
          walk[i] = walk[j]!
          walk[j] = swap
        }
        const shuffled = forHop(s)
        hopInOrder(shuffled, walk)
        bad.push(...lintHop(s, fast).map((note) => `seed ${seed} hop ${k}: ${note}`))
        if (!same(shuffled, fast)) bad.push(`seed ${seed} hop ${k}: the walk order changed the hop`)
        if (!same(slow, fast)) bad.push(`seed ${seed} hop ${k}: the slow reference disagrees`)
        moves += fast.belts.from.filter((x, y) => x >= 0 && x !== y).length
        for (let c = 0; c < nCells; c++) {
          const x = 2 * c + 1
          if (s.belts.fork[c]! < 0 || s.belts.slot[x]! < 0) continue
          const other = s.belts.forkTurn[c] === 1 ? s.net.next[x]! : s.net.next2[x]!
          if (other >= 0 && fast.belts.from[other] === x) fallbacks++
        }
        s = fast
      }
    }
    expect(bad).toEqual([])
    // The networks keep things moving.
    expect(moves).toBeGreaterThan(NETS * HOPS * 3)
    // And forks often find their way shut and send things the other way.
    expect(fallbacks).toBeGreaterThan(NETS / 10)
  })

  it('stand still when a loop is full and turn whole with one gap, whatever its shape', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = rng(seed)
      const s = emptyBoard()
      const w = 2 + Math.floor(r() * 5)
      const h = 2 + Math.floor(r() * 4)
      const path: [number, number][] = []
      for (let x = 2; x < 2 + w; x++) path.push([x, 2])
      for (let y = 3; y < 2 + h; y++) path.push([1 + w, y])
      for (let x = 1 + w - 1; x >= 2; x--) path.push([x, 1 + h])
      for (let y = h; y >= 3; y--) path.push([2, y])
      const cells = loop(s, path)
      rebuild(s)
      const slots = lane(cells)
      slots.forEach((x) => put(s, x, THINGS[Math.floor(r() * THINGS.length)]!))
      const full = read(s, slots)
      hop(s)
      expect(read(s, slots)).toEqual(full)
      const gap = Math.floor(r() * slots.length)
      s.belts.slot[slots[gap]!] = -1
      const before = read(s, slots)
      hop(s)
      const after = read(s, slots)
      before.forEach((t, i) => {
        if (t !== '.') expect(after[(i + 1) % slots.length]).toBe(t)
      })
    }
  })
})
