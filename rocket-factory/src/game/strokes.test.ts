/**
 * The stroke table case by case, with the network lint after every case: laying, rolling
 * back, mouths (and stepping into one a cell short), feeding a tail, joins, bridges (and the
 * join one cell past), every stop, forks and how near a belt's end they may start, carrying
 * on, extending upstream, turning a belt round with its things in place, taking a hedge back,
 * closing a loop, the helpful flip, the hint's path and the stroke's length. Then the
 * sticker's ghost (its snapping and every grey reason), hedges, the peel, applyEdit and its
 * inverse (the layout comes back exactly), the things an edit hands back, and a fuzz of random
 * strokes, stickers and peels that must keep the lint clean and every inverse exact.
 */
import { describe, expect, it } from 'vitest'

import { add, emptyBoard, line, put, read } from './beltKit'
import { cellOf } from './board'
import { hop, rebuild } from './belts'
import { STROKE_MAX } from './catalog'
import { CELLS, inSlot, outSlot, overIn, type Dir, type Placeable, type State } from './model'
import { rng } from './random'
import { blankState } from './rules'
import { applyEdit, lintNet, planHedge, planPeelBuilding, planPeelDrag, planPlace, planRun, planStroke, stickersLeft, type EndSign } from './strokes'

const E: Dir = 0
const S: Dir = 1
const W: Dir = 2
const N: Dir = 3
const cells = (xy: readonly (readonly [number, number])[]) => xy.map(([x, y]) => cellOf(x, y))
/** A cell's belt as [in, out, fork, over], or null. */
const belt = (s: State, x: number, y: number) => {
  const c = cellOf(x, y)
  return s.belts.out[c]! < 0 ? null : [s.belts.in[c], s.belts.out[c], s.belts.fork[c], s.belts.over[c]]
}
/** Plans a stroke over these cells, commits it, and checks the layout it leaves is sound. */
function draw(s: State, xy: readonly (readonly [number, number])[], hint: number[] | null) {
  const plan = planStroke(s, cells(xy), hint)
  if (plan.edit !== null) applyEdit(s, plan.edit)
  expect(lintNet(s)).toEqual([])
  return plan
}
/** How many things there are on the belts, in the buildings and in the rocket. */
const census = (s: State) => s.belts.slot.filter((v) => v >= 0).length + s.buildings.reduce((n, b) => n + b.held.reduce((a, k) => a + k, 0) + b.queue.length + b.stack.length, 0) + s.rocket.got.reduce((a, k) => a + k, 0)
/** A board with an empty land and every sticker endless. */
function board(): State {
  const s = emptyBoard()
  s.launches = 1
  return s
}
const expectSign = (plan: { sign: EndSign }, sign: EndSign) => expect(plan.sign).toBe(sign)
/** The layout an edit may change: every belt cell's sides and pattern, the hedges, the buildings where they stand. */
const layout = (s: State) =>
  JSON.stringify({
    b: [s.belts.in, s.belts.out, s.belts.fork, s.belts.over, s.belts.pattern].map((a) => Array.from(a)),
    h: Array.from(s.hedge),
    k: s.buildings.map((b) => [b.id, b.kind, b.x, b.y]).sort(),
  })

describe('a stroke', () => {
  it('lays belts on the ground, straight and round a bend, each cell into the next', () => {
    const s = board()
    const plan = draw(s, [[4, 5], [5, 5], [6, 5], [6, 6]], null)
    expect(plan.cells).toEqual(cells([[4, 5], [5, 5], [6, 5], [6, 6]]))
    expectSign(plan, 'none')
    expect(belt(s, 4, 5)).toEqual([W, E, -1, -1])
    expect(belt(s, 6, 5)).toEqual([W, S, -1, -1])
    expect(belt(s, 6, 6)).toEqual([N, S, -1, -1])
    expect(s.belts.laidAt[cellOf(4, 5)]).toBe(s.tick)
  })

  it('rolls up the cells it goes back over, and shows the curl while it does', () => {
    const s = board()
    const plan = planStroke(s, cells([[4, 5], [5, 5], [6, 5], [7, 5], [6, 5]]), null)
    expectSign(plan, 'curl')
    expect(plan.cells).toEqual(cells([[4, 5], [5, 5], [6, 5]]))
    expect(planStroke(s, cells([[4, 5], [5, 5], [4, 5]]), null).edit).toBeNull()
  })

  it('ends in a mouth at a building edge, and steps into one from a cell short', () => {
    const s = board()
    const oven = add(s, 'oven', 8, 4)
    rebuild(s)
    expectSign(draw(s, [[4, 5], [5, 5], [6, 5], [7, 5], [8, 5]], null), 'mouth')
    expect(s.net.next[outSlot(cellOf(7, 5))]).toBe(-2 - oven.id)
    const short = draw(s, [[5, 4], [6, 4]], null)
    expectSign(short, 'mouth')
    expect(short.cells).toEqual(cells([[5, 4], [6, 4], [7, 4]]))
    expect(s.net.mouths.get(oven.id)!.length).toBe(2)
  })

  it('leads out of a building from the first cell past its footprint', () => {
    const s = board()
    const oven = add(s, 'oven', 4, 4)
    rebuild(s)
    const plan = draw(s, [[5, 5], [6, 5], [7, 5], [8, 5]], null)
    expect(plan.cells).toEqual(cells([[6, 5], [7, 5], [8, 5]]))
    expect(s.net.spouts.get(oven.id)).toEqual([inSlot(cellOf(6, 5))])
  })

  it('bridges a plain straight belt running past a building straight out of it, the bridge lane its spout, but stops one cell past it', () => {
    const s = board()
    const oven = add(s, 'oven', 4, 4)
    line(s, [[6, 3], [6, 4], [6, 5], [6, 6], [6, 7]])
    rebuild(s)
    const onePast = planStroke(s, cells([[5, 5], [6, 5], [7, 5]]), null)
    expectSign(onePast, 'stop')
    expect(onePast.edit).toBeNull()
    const plan = draw(s, [[5, 5], [6, 5], [7, 5], [8, 5]], null)
    expectSign(plan, 'hump')
    expect(belt(s, 6, 5)).toEqual([N, S, -1, E])
    expect(s.net.spouts.get(oven.id)).toEqual([overIn(cellOf(6, 5))])
    expect(s.net.next[overIn(cellOf(6, 5)) + 1]).toBe(inSlot(cellOf(7, 5)))
    // A bend running past is not bridged: nothing leads out.
    const t = board()
    add(t, 'oven', 4, 4)
    line(t, [[6, 4], [6, 5], [7, 5], [8, 5]])
    rebuild(t)
    expect(planStroke(t, cells([[5, 5], [6, 5], [7, 5], [8, 5]]), null).edit).toBeNull()
  })

  it('feeds a belt it runs onto at its tail, and joins one it ends on at its side', () => {
    const s = board()
    line(s, [[7, 7], [8, 7], [9, 7]])
    line(s, [[8, 3], [8, 4], [8, 5], [8, 6]])
    rebuild(s)
    expectSign(draw(s, [[4, 7], [5, 7], [6, 7], [7, 7], [8, 7]], null), 'feed')
    expect(s.net.next[outSlot(cellOf(6, 7))]).toBe(inSlot(cellOf(7, 7)))
    const join = draw(s, [[5, 5], [6, 5], [7, 5], [8, 5]], null)
    expectSign(join, 'zip')
    expect(s.net.next[outSlot(cellOf(7, 5))]).toBe(outSlot(cellOf(8, 5)))
  })

  it('bridges a plain straight belt it crosses straight on, but joins it when it ends one cell past', () => {
    const s = board()
    line(s, [[6, 3], [6, 4], [6, 5], [6, 6], [6, 7]])
    rebuild(s)
    const onePast = planStroke(s, cells([[4, 5], [5, 5], [6, 5], [7, 5]]), null)
    expectSign(onePast, 'zip')
    expect(onePast.cells).toEqual(cells([[4, 5], [5, 5]]))
    const bridge = draw(s, [[4, 5], [5, 5], [6, 5], [7, 5], [8, 5]], null)
    expectSign(bridge, 'hump')
    expect(belt(s, 6, 5)).toEqual([N, S, -1, E])
    expect(s.net.next[outSlot(cellOf(5, 5))]).toBe(overIn(cellOf(6, 5)))
    expect(s.net.next[overIn(cellOf(6, 5)) + 1]).toBe(inSlot(cellOf(7, 5)))
    // A bend is never bridged: the stroke stops at its side.
    const t = board()
    line(t, [[6, 4], [6, 5], [7, 5], [8, 5]])
    rebuild(t)
    const bend = draw(t, [[4, 5], [5, 5], [6, 5], [7, 5]], null)
    expectSign(bend, 'stop')
    expect(bend.cells).toEqual(cells([[4, 5], [5, 5]]))
  })

  it('stops at water, a tree, a burrow, the basket and closed land, its ghost a cell short', () => {
    const s = board()
    const cases: [readonly (readonly [number, number])[], number][] = [
      [[[3, 8], [2, 8], [1, 8]], 2],
      [[[6, 8], [7, 8], [8, 8], [9, 8]], 2],
      [[[9, 3], [10, 3], [11, 3]], 2],
      [[[2, 5], [1, 5], [0, 5]], 2],
      [[[11, 6], [12, 6], [13, 6]], 2],
    ]
    for (const [xy, n] of cases) {
      const t = structuredClone(s)
      const plan = draw(t, xy, null)
      expectSign(plan, 'stop')
      expect(plan.cells.length).toBe(n)
    }
  })

  it('never makes a head-on pair: into a belt head it stops two cells short', () => {
    const s = board()
    line(s, [[8, 5], [7, 5], [6, 5]])
    rebuild(s)
    const plan = draw(s, [[4, 5], [5, 5], [6, 5]], null)
    expectSign(plan, 'stop')
    expect(plan.cells).toEqual(cells([[4, 5]]))
    // A stroke ending right in front of a belt head comes a cell short too.
    const t = board()
    line(t, [[8, 5], [7, 5]])
    rebuild(t)
    const end = draw(t, [[4, 5], [5, 5], [6, 5]], null)
    expect(end.cells).toEqual(cells([[4, 5], [5, 5]]))
  })

  it('turns into a join when it turns on a belt it ran into', () => {
    const s = board()
    line(s, [[6, 3], [6, 4], [6, 5], [6, 6], [6, 7]])
    rebuild(s)
    const plan = draw(s, [[4, 5], [5, 5], [6, 5], [6, 6]], null)
    expectSign(plan, 'zip')
    expect(belt(s, 6, 6)).toEqual([N, S, -1, -1])
  })

  it('forks from a plain straight belt two or more cells from its end, and carries on from its last two', () => {
    const s = board()
    line(s, [[4, 5], [5, 5], [6, 5], [7, 5], [8, 5], [9, 5]])
    rebuild(s)
    const fork = draw(s, [[6, 5], [6, 6], [6, 7]], null)
    expectSign(fork, 'split')
    expect(belt(s, 6, 5)).toEqual([W, E, S, -1])
    expect(s.net.next2[outSlot(cellOf(6, 5))]).toBe(inSlot(cellOf(6, 6)))
    // The last cell turns to carry on; so does the one before it, and the old last cell rolls up in the same edit.
    const t = board()
    line(t, [[4, 5], [5, 5], [6, 5], [7, 5], [8, 5], [9, 5]])
    rebuild(t)
    const last = draw(structuredClone(t), [[9, 5], [9, 6], [9, 7]], null)
    expect(last.cells).toEqual(cells([[9, 5], [9, 6], [9, 7]]))
    const u = structuredClone(t)
    put(u, inSlot(cellOf(9, 5)), 'blueRock')
    const plan = planStroke(u, cells([[8, 5], [8, 6]]), null)
    expect(plan.edit!.belts.find((b) => b.cell === cellOf(9, 5))).toEqual({ cell: cellOf(9, 5), before: { in: W, out: E, fork: -1, over: -1, pattern: 0 }, after: null })
    const { displaced } = applyEdit(u, plan.edit!)
    expect(lintNet(u)).toEqual([])
    expect(belt(u, 8, 5)).toEqual([W, S, -1, -1])
    expect(belt(u, 9, 5)).toBeNull()
    expect(u.net.next[outSlot(cellOf(8, 5))]).toBe(inSlot(cellOf(8, 6)))
    expect(displaced.map((x) => x.thing)).toEqual(['blueRock'])
    // Along its way and past its dead end: it carries on straight.
    const v = structuredClone(t)
    expect(draw(v, [[7, 5], [8, 5], [9, 5], [10, 5], [11, 5]], null).cells).toEqual(cells([[10, 5], [11, 5]]))
  })

  it('rolls up the old last cell from the one before it only when nothing else holds it', () => {
    const t = board()
    line(t, [[4, 5], [5, 5], [6, 5], [7, 5], [8, 5], [9, 5]])
    rebuild(t)
    // A side join into the old last cell keeps it: it is that belt's dead end now.
    const joined = structuredClone(t)
    line(joined, [[9, 3], [9, 4]])
    joined.belts.out[cellOf(9, 4)] = S
    rebuild(joined)
    draw(joined, [[8, 5], [8, 6]], null)
    expect(belt(joined, 9, 5)).toEqual([W, E, -1, -1])
    // A tower standing on it holds it down.
    const held = structuredClone(t)
    add(held, 'tower', 9, 5)
    rebuild(held)
    draw(held, [[8, 5], [8, 6]], null)
    expect(belt(held, 9, 5)).toEqual([W, E, -1, -1])
    // Under a bridge only its own lane goes: the belt crossing it stays, a plain cell.
    const bridged = structuredClone(t)
    bridged.belts.over[cellOf(9, 5)] = S
    line(bridged, [[9, 3], [9, 4]])
    line(bridged, [[9, 6], [9, 7]])
    rebuild(bridged)
    put(bridged, overIn(cellOf(9, 5)), 'gear')
    put(bridged, inSlot(cellOf(9, 5)), 'goldBar')
    const plan = planStroke(bridged, cells([[8, 5], [8, 6], [7, 6]]), null)
    const { displaced } = applyEdit(bridged, plan.edit!)
    expect(lintNet(bridged)).toEqual([])
    expect(belt(bridged, 9, 5)).toEqual([N, S, -1, -1])
    expect(read(bridged, [inSlot(cellOf(9, 5))])).toEqual(['gear'])
    expect(displaced.map((x) => x.thing)).toEqual(['goldBar'])
    // A stroke that comes back into it keeps it, and joins it.
    const back = structuredClone(t)
    const into = draw(back, [[8, 5], [8, 6], [9, 6], [9, 5]], null)
    expectSign(into, 'zip')
    expect(belt(back, 9, 5)).toEqual([W, E, -1, -1])
  })

  it('leads out of the pump, which stands on the pond, and into it as into any building', () => {
    const s = board()
    const pump = add(s, 'pump', 0, 8)
    add(s, 'orangeMaker', 4, 7)
    rebuild(s)
    const t = structuredClone(s)
    const out = draw(s, [[1, 8], [2, 8], [3, 8], [4, 8]], null)
    expectSign(out, 'mouth')
    expect(out.cells).toEqual(cells([[2, 8], [3, 8]]))
    expect(s.net.spouts.get(pump.id)).toEqual([inSlot(cellOf(2, 8))])
    // Drawn from the maker into the pump it ends in the pump's mouth, and the helpful flip turns it round: the pump gives what the maker takes.
    const back = draw(t, [[4, 8], [3, 8], [2, 8], [1, 8]], null)
    expect(back.flipped).toBe(true)
    expect(t.net.spouts.get(pump.id)).toEqual([inSlot(cellOf(2, 8))])
  })

  it('stops a fork too near the end of a belt that runs into a building', () => {
    const s = board()
    add(s, 'oven', 8, 4)
    line(s, [[4, 5], [5, 5], [6, 5], [7, 5]])
    rebuild(s)
    for (const x of [6, 7]) expectSign(planStroke(s, cells([[x, 5], [x, 6]]), null), 'stop')
    expectSign(draw(s, [[5, 5], [5, 6], [5, 7]], null), 'split')
  })

  it('extends a belt upstream from its first cell, behind it or to its side', () => {
    const s = board()
    line(s, [[6, 5], [7, 5], [8, 5]])
    rebuild(s)
    const behind = draw(structuredClone(s), [[6, 5], [5, 5], [4, 5]], null)
    expect(behind.cells).toEqual(cells([[5, 5], [4, 5]]))
    const t = structuredClone(s)
    draw(t, [[6, 5], [6, 4], [6, 3]], null)
    expect(belt(t, 6, 5)).toEqual([N, E, -1, -1])
    expect(belt(t, 6, 3)).toEqual([N, S, -1, -1])
    expect(t.net.next[outSlot(cellOf(6, 4))]).toBe(inSlot(cellOf(6, 5)))
    // Behind a bridge's over lane it extends that lane, the bridge left as it is.
    const w = board()
    line(w, [[4, 5], [5, 5], [6, 5], [7, 5], [8, 5]])
    w.belts.over[cellOf(6, 5)] = S
    rebuild(w)
    draw(w, [[6, 5], [6, 4], [6, 3]], null)
    expect(belt(w, 6, 5)).toEqual([W, E, -1, S])
    expect(w.net.next[outSlot(cellOf(6, 4))]).toBe(overIn(cellOf(6, 5)))
    // Out of a building it starts at the footprint, a spout.
    const u = board()
    const oven = add(u, 'oven', 4, 2)
    line(u, [[6, 5], [7, 5], [8, 5]])
    rebuild(u)
    expectSign(draw(u, [[6, 5], [5, 5], [5, 4], [5, 3]], null), 'mouth')
    expect(u.net.spouts.get(oven.id)).toEqual([inSlot(cellOf(5, 4))])
  })

  it('turns a belt round when it starts on it against its way, things kept in place, on to the far end', () => {
    const s = board()
    const run = line(s, [[4, 5], [5, 5], [6, 5], [7, 5], [8, 5]])
    rebuild(s)
    put(s, inSlot(run[1]!), 'gear')
    put(s, outSlot(run[3]!), 'blueBar')
    const plan = draw(s, [[8, 5], [7, 5], [6, 5]], null)
    expect(plan.cells.sort()).toEqual([...run].sort())
    expect(plan.flipped).toBe(false)
    for (const c of run) expect([s.belts.in[c], s.belts.out[c]]).toEqual([E, W])
    expect(read(s, [outSlot(run[1]!), inSlot(run[3]!)])).toEqual(['gear', 'blueBar'])
    expect(s.belts.turnedAt[run[2]!]).toBe(s.tick)
    // And on past its far end it carries on, round the corner.
    const t = board()
    line(t, [[4, 5], [5, 5], [6, 5]])
    rebuild(t)
    draw(t, [[6, 5], [5, 5], [4, 5], [4, 6]], null)
    expect(belt(t, 4, 5)).toEqual([E, S, -1, -1])
    expect(belt(t, 4, 6)).toEqual([N, S, -1, -1])
  })

  it('turns a fork branch round into a join on the belt it came from', () => {
    const s = board()
    line(s, [[4, 5], [5, 5], [6, 5], [7, 5], [8, 5], [9, 5]])
    rebuild(s)
    draw(s, [[6, 5], [6, 6], [6, 7]], null)
    draw(s, [[6, 7], [6, 6]], null)
    expect(belt(s, 6, 5)).toEqual([W, E, -1, -1])
    expect(s.net.next[outSlot(cellOf(6, 6))]).toBe(outSlot(cellOf(6, 5)))
  })

  it('takes a hedge it passes through back to the tray, and closes a loop into its own first cell', () => {
    const s = board()
    s.hedge[cellOf(5, 5)] = 1
    const plan = draw(s, [[4, 5], [5, 5], [6, 5]], null)
    expect(plan.edit!.hedges).toEqual([{ cell: cellOf(5, 5), before: 1, after: 0 }])
    expect(s.hedge[cellOf(5, 5)]).toBe(0)
    const t = board()
    const ring = draw(t, [[4, 4], [5, 4], [5, 5], [4, 5], [4, 4]], null)
    expectSign(ring, 'feed')
    expect(belt(t, 4, 4)).toEqual([S, E, -1, -1])
    expect(t.net.next[outSlot(cellOf(4, 5))]).toBe(inSlot(cellOf(4, 4)))
  })

  it('lays the hint path when it starts and ends where the hint does', () => {
    const s = board()
    const hint = cells([[4, 5], [5, 5], [5, 6], [6, 6]])
    expect(draw(s, [[4, 5], [4, 6], [5, 6], [6, 6]], hint).cells).toEqual(hint)
  })

  it("lays her own way between the hint path's two buildings as she drew it: only a wobbly trace (two thirds of her cells off their footprints the path's) lays the path", () => {
    const at = () => {
      const s = board()
      add(s, 'oven', 2, 5)
      add(s, 'lab', 8, 5)
      rebuild(s)
      return s
    }
    // The hint's path along row 5, out of the oven's east side into the lab's west side.
    const hint = cells([[3, 5], [4, 5], [5, 5], [6, 5], [7, 5], [8, 5]])
    // Her way round row 7, keeping row 5 free: hers, into the lab's mouth from below.
    const mine = draw(at(), [[3, 6], [3, 7], [4, 7], [5, 7], [6, 7], [7, 7], [8, 7], [8, 6]], hint)
    expect(mine.cells).toEqual(cells([[3, 7], [4, 7], [5, 7], [6, 7], [7, 7], [8, 7]]))
    expectSign(mine, 'mouth')
    // A wobble off the row and back: four of her six cells are the path's, so the path.
    expect(draw(at(), [[3, 5], [4, 5], [5, 5], [5, 6], [6, 6], [6, 5], [7, 5], [8, 5]], hint).cells).toEqual(cells([[4, 5], [5, 5], [6, 5], [7, 5]]))
    // Two of six, a row of her own: hers.
    expect(draw(at(), [[3, 5], [4, 5], [4, 4], [5, 4], [6, 4], [7, 4], [7, 5], [8, 5]], hint).cells).toEqual(cells([[4, 5], [4, 4], [5, 4], [6, 4], [7, 4], [7, 5]]))
  })

  it(`lays at most ${STROKE_MAX} cells`, () => {
    const s = board()
    s.land = 3
    const path: [number, number][] = []
    for (let x = 4; x <= 17; x++) path.push([x, 5])
    for (let x = 17; x >= 4; x--) path.push([x, 6])
    for (let x = 4; x <= 17; x++) path.push([x, 7])
    const plan = draw(s, path, null)
    expect(plan.cells.length).toBe(STROKE_MAX)
    expectSign(plan, 'stop')
  })
})

describe('the helpful flip', () => {
  it('turns a belt between two buildings round when only the other way is any use', () => {
    const s = board()
    add(s, 'oven', 4, 4)
    const shop = add(s, 'workshop', 8, 4)
    rebuild(s)
    const plan = draw(s, [[8, 5], [7, 5], [6, 5], [5, 5]], null)
    expect(plan.flipped).toBe(true)
    expectSign(plan, 'mouth')
    expect(s.net.next[outSlot(cellOf(7, 5))]).toBe(-2 - shop.id)
    // Drawn the useful way it stays.
    const t = board()
    add(t, 'oven', 4, 4)
    add(t, 'workshop', 8, 4)
    rebuild(t)
    expect(draw(t, [[5, 5], [6, 5], [7, 5], [8, 5]], null).flipped).toBe(false)
  })

  it('turns a fork into a building that cannot use the belt into a join from it, and a join from one that gives nothing into a fork', () => {
    const s = board()
    const row = line(s, [[4, 7], [5, 7], [6, 7], [7, 7], [8, 7], [9, 7]])
    add(s, 'oven', 6, 4)
    rebuild(s)
    put(s, inSlot(row[0]!), 'gear')
    const plan = draw(s, [[6, 7], [6, 6], [6, 5]], null)
    expect(plan.flipped).toBe(true)
    expectSign(plan, 'zip')
    expect(belt(s, 6, 7)).toEqual([W, E, -1, -1])
    expect(s.net.next[outSlot(cellOf(6, 6))]).toBe(outSlot(cellOf(6, 7)))
    const t = board()
    const bottles = line(t, [[4, 7], [5, 7], [6, 7], [7, 7], [8, 7], [9, 7]])
    const lab = add(t, 'lab', 6, 4)
    rebuild(t)
    put(t, inSlot(bottles[0]!), 'greenBottle')
    const join = draw(t, [[6, 5], [6, 6], [6, 7]], null)
    expect(join.flipped).toBe(true)
    expectSign(join, 'split')
    expect(t.net.next2[outSlot(cellOf(6, 7))]).toBe(inSlot(cellOf(6, 6)))
    expect(t.net.next[outSlot(cellOf(6, 6))]).toBe(-2 - lab.id)
  })
})

describe('a sticker ghost', () => {
  const ghost = (s: State, sticker: Placeable, x: number, y: number) => planPlace(s, sticker, x, y, null)

  it('snaps to the nearest spot it can stand on within 0.6 cell, the hint spot first', () => {
    const s = blankState(1)
    s.launches = 1
    line(s, [[6, 5], [7, 5], [8, 5]])
    rebuild(s)
    const near = ghost(s, 'tower', 5.95, 5.5)
    expect([near.x, near.y, near.ok]).toEqual([6, 5, true])
    const far = ghost(s, 'tower', 4.6, 2.5)
    expect([far.x, far.y, far.ok, far.reason]).toEqual([4, 2, false, 'noBelt'])
    expect([ghost(s, 'tower', 7, 5.5).x, planPlace(s, 'tower', 7, 5.5, { x: 7, y: 5 }).x]).toEqual([6, 7])
    // Only diggers stand on rocks, even on a belt.
    line(s, [[7, 3], [8, 3]])
    rebuild(s)
    expect(ghost(s, 'tower', 7.5, 3.5).reason).toBe('rock')
    expect(ghost(s, 'digger', 8, 3.1)).toMatchObject({ x: 7, y: 2, ok: true })
  })

  it('is grey only for reasons she can see', () => {
    const s = blankState(1)
    s.launches = 1
    const flowers = line(s, [[10, 4], [11, 4], [12, 4]])
    line(s, [[5, 3], [6, 3], [7, 3]])
    rebuild(s)
    void flowers
    const grey = (sticker: Placeable, x: number, y: number) => planPlace(s, sticker, x + 1, y + 1, null).reason
    expect(grey('oven', 0, 8)).toBe('water')
    expect(grey('oven', 8, 7)).toBe('tree')
    expect(grey('oven', 11, 2)).toBe('burrow')
    expect(grey('oven', 4, 4)).toBe('pad')
    expect(grey('oven', 0, 5)).toBe('basket')
    expect(grey('oven', 6, 5)).toBe('building')
    expect(grey('oven', 12, 5)).toBe('land')
    expect(grey('oven', 7, 2)).toBe('rock')
    expect(grey('digger', 5, 2)).toBe('noRock')
    expect(grey('pump', 1, 8)).toBe('noPond')
    expect(planPlace(s, 'pump', 1, 9, null).ok).toBe(true)
    expect(planPlace(s, 'tower', 5.5, 8.5, null).reason).toBe('noBelt')
    expect(planPlace(s, 'bowl', 6.5, 3.5, null).reason).toBe('noFlowers')
    expect(planPlace(s, 'bowl', 11.5, 4.5, null).ok).toBe(true)
    s.launches = 0
    expect(grey('workshop', 4, 2)).toBe('empty')
    expect(stickersLeft(s, 'oven')).toBe(0)
    s.found = ['digger', 'gold', 'science', 'gears']
    expect(stickersLeft(s, 'oven')).toBe(2)
    expect(stickersLeft(s, 'workshop')).toBe(1)
    s.launches = 1
    expect(stickersLeft(s, 'workshop')).toBe(Infinity)
  })

  it('covers the belts and hedges under a machine, settles a fork whose branch it covers, and drops what rode there into the machine or onto the belt going on', () => {
    const s = board()
    const run = line(s, [[3, 5], [4, 5], [5, 5], [6, 5], [7, 5], [8, 5], [9, 5]])
    rebuild(s)
    draw(s, [[4, 5], [4, 6], [4, 7]], null)
    s.hedge[cellOf(6, 4)] = 1
    put(s, inSlot(run[3]!), 'blueRock')
    put(s, outSlot(run[3]!), 'gear')
    const plan = planPlace(s, 'oven', 6, 5, null)
    expect([plan.x, plan.y, plan.ok]).toEqual([5, 4, true])
    expect(plan.covers.sort()).toEqual(cells([[5, 5], [6, 5]]).sort())
    expect(plan.hedges).toEqual([cellOf(6, 4)])
    const { displaced } = applyEdit(s, plan.edit!)
    expect(lintNet(s)).toEqual([])
    const oven = s.buildings.find((b) => b.kind === 'oven')!
    expect(oven.queue).toEqual(['blueRock'])
    expect(displaced).toEqual([])
    expect(read(s, [inSlot(run[4]!)])).toEqual(['gear'])
    // A machine dropped on a fork's branch start leaves the fork a plain belt.
    const t = board()
    line(t, [[3, 5], [4, 5], [5, 5], [6, 5], [7, 5], [8, 5]])
    rebuild(t)
    draw(t, [[5, 5], [5, 6], [5, 7], [5, 8]], null)
    expect(belt(t, 5, 5)).toEqual([W, E, S, -1])
    applyEdit(t, planPlace(t, 'oven', 6, 7, null).edit!)
    expect(lintNet(t)).toEqual([])
    expect(belt(t, 5, 5)).toEqual([W, E, -1, -1])
  })
})

describe('hedges and the peel', () => {
  it('plants hedges while stickers last, leaving gaps at belts and stopping at buildings', () => {
    const s = blankState(1)
    s.found = ['digger', 'gold', 'science', 'gears', 'hedges']
    line(s, [[8, 4], [8, 5], [8, 6]])
    rebuild(s)
    const plan = planHedge(s, cells([[4, 5], [5, 5], [6, 5], [7, 5], [8, 5], [9, 5]]))
    expect(plan.cells).toEqual(cells([[5, 5], [6, 5], [7, 5], [9, 5]]))
    expect(planHedge(s, cells([[5, 7], [6, 7], [7, 7], [8, 7]])).cells).toEqual(cells([[5, 7]]))
    applyEdit(s, plan.edit!)
    expect(lintNet(s)).toEqual([])
    expect(stickersLeft(s, 'hedge')).toBe(8 - 4)
    s.found = ['digger', 'gold', 'science', 'gears']
    expect(planHedge(s, cells([[5, 9], [6, 9]])).edit).toBeNull()
  })

  it('plants hedges on rocks, and a digger placed there later takes them back into the tray', () => {
    const s = blankState(1)
    s.found = ['digger', 'gold', 'science', 'gears', 'hedges']
    rebuild(s)
    // Burrow A's ring grows on blue rocks at (10, 2) and (10, 3): a fence can close it there.
    const plan = planHedge(s, cells([[10, 2], [10, 3], [10, 4]]))
    expect(plan.cells).toEqual(cells([[10, 2], [10, 3], [10, 4]]))
    applyEdit(s, plan.edit!)
    expect(stickersLeft(s, 'hedge')).toBe(8 - 3)
    const digger = planPlace(s, 'digger', 10, 3, { x: 9, y: 2 })
    expect(digger.ok).toBe(true)
    expect(digger.hedges).toEqual(cells([[10, 2], [10, 3]]))
    applyEdit(s, digger.edit!)
    expect(stickersLeft(s, 'hedge')).toBe(8 - 1)
  })

  it('rolls up the belts and hedges a peel drag passes, but not a belt under a tower, and takes a bridge lane by its way', () => {
    const s = board()
    line(s, [[4, 5], [5, 5], [6, 5], [7, 5], [8, 5]])
    line(s, [[6, 3], [6, 4], [6, 5], [6, 6], [6, 7]])
    s.belts.in[cellOf(6, 5)] = W
    s.belts.out[cellOf(6, 5)] = E
    s.belts.over[cellOf(6, 5)] = S
    add(s, 'tower', 8, 5)
    s.hedge[cellOf(4, 6)] = 1
    rebuild(s)
    expect(lintNet(s)).toEqual([])
    const drag = planPeelDrag(s, cells([[6, 3], [6, 4], [6, 5], [6, 6]]))
    applyEdit(s, drag.edit!)
    expect(lintNet(s)).toEqual([])
    expect(belt(s, 6, 5)).toEqual([W, E, -1, -1])
    expect(belt(s, 6, 4)).toBeNull()
    const along = planPeelDrag(s, cells([[7, 5], [8, 5], [8, 6]]))
    applyEdit(s, along.edit!)
    expect(belt(s, 8, 5)).not.toBeNull()
    expect(belt(s, 7, 5)).toBeNull()
    applyEdit(s, planPeelDrag(s, cells([[4, 6]])).edit!)
    expect(s.hedge[cellOf(4, 6)]).toBe(0)
    expect(lintNet(s)).toEqual([])
  })

  it('lifts a run up to the next fork, join or building, and peels a building with everything in it', () => {
    const s = board()
    line(s, [[3, 5], [4, 5], [5, 5], [6, 5], [7, 5], [8, 5], [9, 5]])
    rebuild(s)
    draw(s, [[6, 5], [6, 6], [6, 7]], null)
    const run = planRun(s, cellOf(4, 5))
    expect(run.cells).toEqual(cells([[3, 5], [4, 5], [5, 5]]))
    applyEdit(s, run.edit!)
    expect(lintNet(s)).toEqual([])
    const t = blankState(1)
    const oven = t.buildings.find((b) => b.kind === 'oven')!
    oven.queue = ['goldRock']
    oven.stack = ['blueBar']
    oven.batch = { makes: 'goldBar', at: 0, until: 60 }
    const { displaced, inverse } = applyEdit(t, planPeelBuilding(t, oven.id))
    expect(displaced.map((x) => x.thing).sort()).toEqual(['blueBar', 'goldBar', 'goldRock'])
    expect(displaced[0]).toMatchObject({ x: 7, y: 7 })
    expect(t.buildings.some((b) => b.id === oven.id)).toBe(false)
    applyEdit(t, inverse)
    expect(t.buildings.find((b) => b.id === oven.id)).toMatchObject({ kind: 'oven', x: 6, y: 6 })
    expect(() => planPeelBuilding(t, 0)).toThrow()
  })
})

describe('applyEdit', () => {
  it('gives back an inverse that brings the layout back exactly', () => {
    const s = board()
    const before = layout(s)
    const plan = planStroke(s, cells([[4, 5], [5, 5], [6, 5], [6, 6]]), null)
    const { inverse } = applyEdit(s, plan.edit!)
    expect(layout(s)).not.toBe(before)
    applyEdit(s, inverse)
    expect(layout(s)).toBe(before)
    expect(lintNet(s)).toEqual([])
  })

  it('hands back what rode a cell it removes, with where it was', () => {
    const s = board()
    const run = line(s, [[4, 5], [5, 5], [6, 5]])
    rebuild(s)
    put(s, outSlot(run[1]!), 'gear')
    const { displaced } = applyEdit(s, planPeelDrag(s, [run[1]!]).edit!)
    expect(displaced).toEqual([{ thing: 'gear', x: 5.75, y: 5.5 }])
  })

  it('refuses an edit planned for a layout that has changed since', () => {
    const s = board()
    const plan = planStroke(s, cells([[4, 5], [5, 5]]), null)
    applyEdit(s, plan.edit!)
    expect(() => applyEdit(s, plan.edit!)).toThrow()
  })
})

describe('random strokes, stickers and peels', () => {
  it('keep the lint clean and every inverse exact', { timeout: 20_000 }, () => {
    const bad: string[] = []
    const STICKERS: Placeable[] = ['digger', 'oven', 'workshop', 'greenMaker', 'lab', 'tower', 'bowl', 'pump']
    for (let seed = 1; seed <= 60 && bad.length < 10; seed++) {
      const r = rng(seed)
      const int = (n: number) => Math.floor(r() * n)
      const s = blankState(seed)
      s.launches = 1
      s.land = 3
      for (let step = 0; step < 60; step++) {
        const kind = r()
        let edit = null
        if (kind < 0.7) {
          // A wandering finger: straight runs with turns, now and then a step back.
          const path = [cellOf(int(20), int(12))]
          let d = int(4)
          for (let n = 2 + int(14); n > 0; n--) {
            const c = path[path.length - 1]!
            if (path.length > 1 && r() < 0.08) {
              path.push(path[path.length - 2]!)
              continue
            }
            if (r() < 0.3) d = int(4)
            const x = (c % 20) + [1, 0, -1, 0][d]!
            const y = Math.floor(c / 20) + [0, 1, 0, -1][d]!
            if (x >= 0 && x < 20 && y >= 0 && y < 12) path.push(cellOf(x, y))
          }
          edit = planStroke(s, path, null).edit
        } else if (kind < 0.85) edit = planPlace(s, STICKERS[int(STICKERS.length)]!, r() * 20, r() * 12, null).edit
        else if (kind < 0.95) {
          const belts = Array.from({ length: CELLS }, (_, c) => c).filter((c) => s.belts.out[c]! >= 0)
          if (belts.length > 0) edit = planRun(s, belts[int(belts.length)]!).edit
        } else {
          const peelable = s.buildings.filter((b) => b.kind !== 'pad')
          if (peelable.length > 0) edit = planPeelBuilding(s, peelable[int(peelable.length)]!.id)
        }
        if (edit === null) continue
        // Things ride the belts between edits, and every edit keeps them, drops them into a building or hands them back.
        for (let x = 0; x < s.belts.slot.length; x++) if (r() < 0.2 && (x < overIn(0) ? s.belts.out[x >> 1]! >= 0 : s.belts.over[(x - overIn(0)) >> 1]! >= 0)) s.belts.slot[x] = int(8)
        const before = layout(s)
        const count = census(s)
        const { inverse, displaced } = applyEdit(s, edit)
        bad.push(...lintNet(s).map((note) => `seed ${seed} step ${step}: ${note}`))
        if (census(s) + displaced.length !== count) bad.push(`seed ${seed} step ${step}: ${count} things became ${census(s)} and ${displaced.length} handed back`)
        if (r() < 0.25) {
          applyEdit(s, inverse)
          if (layout(s) !== before) bad.push(`seed ${seed} step ${step}: the inverse did not bring the layout back`)
        }
        for (let k = int(4); k > 0; k--) {
          const n = census(s)
          hop(s)
          if (census(s) !== n) bad.push(`seed ${seed} step ${step}: a hop changed ${n} things to ${census(s)}`)
        }
        bad.push(...lintNet(s).map((note) => `seed ${seed} step ${step} after hops: ${note}`))
      }
    }
    expect(bad).toEqual([])
  })
})
