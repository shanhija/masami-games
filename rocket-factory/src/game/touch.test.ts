/**
 * The pointer router, rule by rule as "A touch is read" gives them (plans/rocket-factory.md,
 * Beep and the child's hands): taps, digs, strokes with the axis lock, the L fill and the turn
 * at the lift, ghosts held by their bottom edge, the hint's spot, the lift bridge,
 * one finger on the board and the resting heel or thumb, drops, the held board, the launch, the
 * mouse, the tray and the keys; and that no touch aimed at a muncher ever draws, places or peels.
 */
import { describe, expect, it } from 'vitest'

import { cellOf, yOf } from './board'
import { startView } from './camera'
import { NO_INSETS, SLOP, fingerLift, heldAt, toBoard, toScreen, type Insets, type View } from './layout'
import { HOP, STEP, THINGS, inSlot, thingIndex, type Action, type Dir, type Muncher, type MuncherMode, type Tool } from './model'
import { rng } from './random'
import { rebuild } from './belts'
import { act, blankState, step } from './rules'
import { muncherPoint, thingPoint } from './where'
import { BRIDGE, END_TURN, LOCK, Router, TAP_FOR, keyAction, type Press } from './touch'

const HOME: Insets = { ...NO_INSETS, bottom: 20 }
/** The sim time the fingers start at: tick 6000. */
const T0 = 100
const c = cellOf
const row = (y: number, x0: number, x1: number) => Array.from({ length: Math.abs(x1 - x0) + 1 }, (_, i) => cellOf(x0 + Math.sign(x1 - x0) * i, y))
const PENCIL: Tool = { kind: 'pencil' }
const OVEN: Tool = { kind: 'sticker', sticker: 'oven' }
/** The board point at the middle of the start view: where Space looks for the nearest muncher. */
const MIDDLE = { x: 10, y: 6 }

/**
 * A blank game at tick 6000, on a sideways Air in full screen (54 px cells),
 * and a router recording what it sends. Fingers go down, move and lift at board points
 * (cells) through the view `g.v`, at sim times.
 */
function rig(w = 1180, h = 820) {
  const s = blankState(1)
  s.tick = 6000
  const got: Action[] = []
  const g = {
    s,
    v: startView(w, h, 2, true, HOME) as View,
    r: new Router((a) => got.push(a)),
    got,
    down: (id: number, x: number, y: number, t: number, press: Press = 'touch') => g.r.down(s, g.v, id, ...toScreen(g.v, x, y), t, press),
    move: (id: number, x: number, y: number, t: number) => g.r.move(s, g.v, id, ...toScreen(g.v, x, y), t),
    up: (id: number, x: number, y: number, t: number) => g.r.up(s, g.v, id, ...toScreen(g.v, x, y), t),
    tick: (t: number) => g.r.tick(s, g.v, t),
    /** What it sent since the last look, leaving out the kind rules' touches. */
    sent: () => got.splice(0).filter((a) => a.kind !== 'touch'),
  }
  return g
}
function muncher(g: ReturnType<typeof rig>, id: number, x: number, y: number, mode: MuncherMode): Muncher {
  const m: Muncher = { id, burrow: 0, mode, modeAt: 0, cell: cellOf(x, y), toward: cellOf(x, y), stepAt: 0, stepFor: 50, hop: null, homeWhy: null, target: null, tried: [], cheeks: [], grabAt: -1, idleSince: -1, outAt: 0, scout: false, shotBy: -1 }
  g.s.munchers.push(m)
  return m
}
function belt(g: ReturnType<typeof rig>, cells: number[], dir: Dir) {
  for (const cell of cells) {
    g.s.belts.out[cell] = dir
    g.s.belts.in[cell] = (dir + 2) % 4
  }
}
const drag = (cells: number[]) => ({ kind: 'drag', cells })
const release = (commit: boolean) => ({ kind: 'release', commit })
/** The hold a finger at board point (x, y) sends for a sticker of n cells: held by its bottom edge, its footprint's middle above the fingertip. */
const hold = (g: ReturnType<typeof rig>, x: number, y: number, n: number) => {
  const [hx, hy] = heldAt(g.v, ...toScreen(g.v, x, y), n)
  return { kind: 'hold', x: hx, y: hy }
}

/** A rig whose router's actions also act on its state, as the page's do: the rules lay, place, pick and drop. */
function live(w = 1180, h = 820) {
  const g = rig(w, h)
  rebuild(g.s)
  g.r = new Router((a) => {
    g.got.push(a)
    act(g.s, a)
  })
  return g
}

describe('taps', () => {
  it('taps what a touch went down on when it lifts, however long it rested up to TAP_FOR and however far it slid within SLOP of it', () => {
    const g = rig()
    // On the start oven, sliding about inside its footprint for almost two seconds.
    g.down(1, 6.5, 6.5, T0)
    g.move(1, 7.5, 7.5, T0 + 0.3)
    g.up(1, 7.5, 7.5, T0 + TAP_FOR)
    expect(g.sent()).toEqual([{ kind: 'tap', hit: { kind: 'building', id: 1 } }])
    // Past TAP_FOR it is no tap.
    g.down(2, 6.5, 6.5, T0 + 3)
    g.up(2, 6.5, 6.5, T0 + 3 + TAP_FOR + 0.01)
    expect(g.sent()).toEqual([])
    // A heap: a slide past SLOP off it is no tap, even in the same cell and back on it.
    g.s.burrows[0]!.heap[thingIndex('gear')] = 3
    g.down(3, 11.15, 3.6, T0 + 6)
    g.move(3, 11.5, 3.6, T0 + 6.1)
    g.up(3, 11.5, 3.6, T0 + 6.2)
    expect(g.sent()).toEqual([{ kind: 'tap', hit: { kind: 'heap', burrow: 0 } }])
    g.down(4, 11.15, 3.6, T0 + 7)
    g.move(4, 11.9, 3.1, T0 + 7.1)
    g.move(4, 11.15, 3.6, T0 + 7.2)
    g.up(4, 11.15, 3.6, T0 + 7.3)
    expect(g.sent()).toEqual([])
  })

  it('tells the kind rules when a finger lands on the board and when the last one lifts, and a tap comes before its lift', () => {
    const g = rig()
    g.down(1, 3.5, 11.5, T0)
    g.down(2, 9.5, 10.5, T0 + 0.1)
    g.r.down(g.s, g.v, 3, 10, 400, T0 + 0.2, 'touch')
    expect(g.got.splice(0)).toEqual([{ kind: 'touch', down: true }, { kind: 'touch', down: true }])
    // The newer press has the board: the older one's lift taps nothing.
    g.up(1, 3.5, 11.5, T0 + 0.3)
    g.r.up(g.s, g.v, 3, 10, 400, T0 + 0.4)
    expect(g.got.splice(0)).toEqual([])
    g.up(2, 9.5, 10.5, T0 + 0.5)
    expect(g.got.splice(0)).toEqual([{ kind: 'tap', hit: { kind: 'ground', cell: c(9, 10) } }, { kind: 'touch', down: false }])
  })

  it('forgets a lifted finger even when the rules throw at its tap, so the kind rules hear its lift', () => {
    const g = rig()
    g.r = new Router((a) => {
      g.got.push(a)
      if (a.kind === 'tap') throw new Error('a tap on what the other hand took away')
    })
    g.down(1, 6.5, 6.5, T0)
    expect(() => g.up(1, 6.5, 6.5, T0 + 0.2)).toThrow(/took away/)
    expect(g.got.at(-1)).toEqual({ kind: 'touch', down: false })
  })

  it('a tap that slides a little off a machine, a belt or a thing it went down on stays a tap: nothing is drawn until the finger is SLOP off it in another cell', () => {
    const g = rig()
    expect(g.v.cell).toBe(52)
    // 0.1 cell inside the start oven's east edge, sliding 10 px out: still the oven's tap.
    const [ax, ay] = toScreen(g.v, 7.9, 6.6)
    g.r.down(g.s, g.v, 1, ax, ay, T0, 'touch')
    g.r.move(g.s, g.v, 1, ax + 5, ay, T0 + 0.05)
    g.r.move(g.s, g.v, 1, ax + 10, ay, T0 + 0.1)
    g.r.up(g.s, g.v, 1, ax + 10, ay, T0 + 0.15)
    expect(g.sent()).toEqual([{ kind: 'tap', hit: { kind: 'building', id: 1 } }])
    // A belt east along row 10: a tap on (7.5, 10.5) sliding 31 px west is its tap, never a stroke against it.
    belt(g, row(10, 1, 10), 0)
    g.down(2, 7.5, 10.5, T0 + 1)
    g.move(2, 7.2, 10.5, T0 + 1.05)
    g.move(2, 6.9, 10.5, T0 + 1.1)
    g.up(2, 6.9, 10.5, T0 + 1.15)
    g.tick(T0 + 1.5)
    expect(g.sent()).toEqual([{ kind: 'tap', hit: { kind: 'belt', cell: c(7, 10) } }])
    // Slid on, more than SLOP off the cell, it draws from the cell it went down on.
    g.down(3, 7.5, 10.5, T0 + 2)
    g.move(3, 7 - (SLOP + 2) / 52, 10.5, T0 + 2.1)
    expect(g.sent()).toEqual([drag([c(7, 10), c(6, 10)])])
    g.r.cancel(3, T0 + 2.2)
    g.sent()
    // From the oven, a stroke begins SLOP off its footprint, from the cell it left by.
    g.down(4, 7.5, 6.5, T0 + 3)
    g.move(4, 8.5, 6.5, T0 + 3.1)
    expect(g.sent()).toEqual([])
    g.move(4, 8.6, 6.5, T0 + 3.2)
    expect(g.sent()).toEqual([drag([c(7, 6), c(8, 6)])])
  })
})

describe('digs', () => {
  it('digs a bare patch or the pond at once and never strokes, however far the held finger drifts', () => {
    const g = rig()
    g.down(1, 17.5, 11.5, T0)
    expect(g.sent()).toEqual([{ kind: 'dig', cell: c(17, 11), down: true }])
    g.move(1, 12.5, 9.5, T0 + 0.5)
    g.move(1, 5.5, 10.5, T0 + 1)
    expect(g.sent()).toEqual([])
    g.up(1, 5.5, 10.5, T0 + 3)
    expect(g.sent()).toEqual([{ kind: 'dig', cell: c(17, 11), down: false }])
    g.down(2, 0.5, 8.5, T0 + 4)
    g.up(2, 0.5, 8.5, T0 + 4.2)
    expect(g.sent()).toEqual([
      { kind: 'dig', cell: c(0, 8), down: true },
      { kind: 'dig', cell: c(0, 8), down: false },
    ])
    // With the peel a touch on a patch is a tap; with a sticker picked its ghost follows the finger.
    g.s.tool = { kind: 'peel' }
    g.down(3, 17.5, 11.5, T0 + 5)
    g.up(3, 17.5, 11.5, T0 + 5.1)
    expect(g.sent()).toEqual([{ kind: 'tap', hit: { kind: 'patch', cell: c(17, 11) } }])
    g.s.tool = { kind: 'sticker', sticker: 'digger' }
    g.down(4, 17.5, 11.5, T0 + 6)
    expect(g.sent()).toEqual([hold(g, 17.5, 11.5, 2)])
  })
})

describe('strokes', () => {
  it('begins a stroke after STROKE_TRAVEL px with the finger in a second cell, sends its cells as it goes, and lays it a moment after the lift', () => {
    const g = rig()
    // 31 px in the first cell, then 10 px over the edge into the second: not yet.
    g.down(1, 5.1, 9.5, T0)
    g.move(1, 5.7, 9.5, T0 + 0.05)
    g.up(1, 5.7, 9.5, T0 + 0.1)
    expect(g.sent()).toEqual([{ kind: 'tap', hit: { kind: 'ground', cell: c(5, 9) } }])
    g.down(2, 5.9, 9.5, T0 + 1)
    g.move(2, 6.1, 9.5, T0 + 1.05)
    expect(g.sent()).toEqual([])
    g.move(2, 6.4, 9.5, T0 + 1.1)
    expect(g.sent()).toEqual([drag(row(9, 5, 6))])
    g.move(2, 8.5, 9.5, T0 + 1.2)
    expect(g.sent()).toEqual([drag(row(9, 5, 8))])
    // Going back over it appends the cells again: strokes.ts rolls them up.
    g.move(2, 6.5, 9.5, T0 + 1.3)
    expect(g.sent()).toEqual([drag([...row(9, 5, 8), c(7, 9), c(6, 9)])])
    g.up(2, 6.5, 9.5, T0 + 1.4)
    g.tick(T0 + 1.4 + BRIDGE - 0.01)
    expect(g.sent()).toEqual([])
    g.tick(T0 + 1.4 + BRIDGE + 0.01)
    expect(g.sent()).toEqual([release(true)])
  })

  it('begins a stroke from a machine, the pad or a burrow once the finger is SLOP off the footprint, from the cell it left by', () => {
    const g = rig()
    g.down(1, 6.4, 6.5, T0)
    g.move(1, 7.8, 7.6, T0 + 0.2)
    g.move(1, 8.3, 7.6, T0 + 0.25)
    expect(g.sent()).toEqual([])
    g.move(1, 8.6, 7.6, T0 + 0.3)
    expect(g.sent()).toEqual([drag([c(7, 7), c(8, 7)])])
    g.r.cancel(1, T0 + 0.4)
    expect(g.sent()).toEqual([release(false)])
    g.down(2, 2.5, 5.5, T0 + 1)
    g.move(2, 3.9, 5.5, T0 + 1.05)
    g.move(2, 4.4, 5.5, T0 + 1.1)
    expect(g.sent()).toEqual([])
    g.move(2, 4.6, 5.5, T0 + 1.2)
    expect(g.sent()).toEqual([drag([c(3, 5), c(4, 5)])])
    g.r.cancel(2, T0 + 1.3)
    g.sent()
    // A tower is one cell: it strokes like a belt, from its cell once the finger is SLOP off it.
    belt(g, row(10, 3, 6), 0)
    g.s.buildings.push({ ...g.s.buildings[1]!, id: 9, kind: 'tower', x: 5, y: 10 })
    g.s.owner[c(5, 10)] = 9
    g.down(3, 5.5, 10.5, T0 + 2)
    g.move(3, 6.4, 10.5, T0 + 2.1)
    expect(g.sent()).toEqual([])
    g.move(3, 6.6, 10.5, T0 + 2.2)
    expect(g.sent()).toEqual([drag([c(5, 10), c(6, 10)])])
  })

  it('keeps a wobbly stroke in its row until the finger strays LOCK cells from the middle line, never under LOCK_PX', () => {
    const g = rig()
    expect(g.v.cell).toBe(52)
    g.down(1, 2.5, 10.5, T0)
    g.move(1, 3.2, 10.6, T0 + 0.03)
    let t = T0 + 0.03
    // East along row 10, wobbling 0.8 of a cell off its middle line into rows 9 and 11.
    for (let i = 2; i <= 16; i++) g.move(1, 2.5 + i * 0.5, 10.5 + (i % 2 === 0 ? 0.8 : -0.8), (t += 0.03))
    const drags = g.sent() as { kind: 'drag'; cells: number[] }[]
    for (const d of drags) expect(d.cells.every((cell) => yOf(cell) === 10)).toBe(true)
    expect(drags.at(-1)).toEqual(drag(row(10, 2, 10)))
    // Past LOCK it turns, keeping its column then as the finger wobbles across it.
    g.move(1, 10.5, 10.5 + LOCK + 0.05, (t += 0.03))
    expect(g.sent()).toEqual([drag([...row(10, 2, 10), c(10, 11)])])
    g.move(1, 10.5 - 0.8, 11.5, (t += 0.03))
    g.move(1, 10.5 + 0.8, 11.5, (t += 0.03))
    expect(g.sent()).toEqual([])
    // On 16 px cells the lock is LOCK_PX: 1.25 cells.
    const small = rig()
    small.v = { ...small.v, cell: 16 }
    small.down(1, 6.5, 10.5, T0)
    small.move(1, 8.25, 10.5, T0 + 0.03)
    small.move(1, 9.5, 10.5 + 1.2, T0 + 0.06)
    expect(small.sent()).toEqual([drag(row(10, 6, 8)), drag(row(10, 6, 9))])
    small.move(1, 9.5, 10.5 + 1.3, T0 + 0.09)
    expect(small.sent()).toEqual([drag([...row(10, 6, 9), c(9, 11)])])
  })

  it('fills a fast or diagonal finger in with an L that keeps the current direction first', () => {
    const g = rig()
    // One fast move, three cells right and one down: across first, the longer way.
    g.down(1, 5.5, 9.5, T0)
    g.move(1, 8.5, 10.5, T0 + 0.05)
    expect(g.sent()).toEqual([drag([...row(9, 5, 8), c(8, 10)])])
    // Going down column 8, a jump down and right goes down first, then across.
    g.move(1, 10.5, 11.5, T0 + 0.1)
    expect(g.sent()).toEqual([drag([...row(9, 5, 8), c(8, 10), ...row(11, 8, 11).slice(0, 3)])])
    // Dragged off the board, it runs on to the board's edge.
    g.move(1, 65, 11.5, T0 + 0.15)
    expect((g.sent()[0] as { cells: number[] }).cells.at(-1)).toBe(c(59, 11))
  })
})

describe('ghosts and the hint spot', () => {
  it("holds a picked sticker's ghost by its bottom edge above the finger, places it a moment after the lift, and puts it back when its middle is lifted over the tray", () => {
    const g = rig()
    g.s.tool = OVEN
    g.down(1, 9.5, 10.5, T0)
    g.move(1, 10.25, 10.75, T0 + 0.1)
    g.up(1, 10.25, 10.75, T0 + 0.2)
    // An oven's footprint's middle rides 1.15 cells up the screen from the fingertip.
    expect(g.sent()).toEqual([hold(g, 9.5, 10.5, 2), hold(g, 10.25, 10.75, 2)])
    expect(hold(g, 9.5, 10.5, 2).y).toBeCloseTo(10.5 - 1.15, 9)
    g.tick(T0 + 0.2 + BRIDGE + 0.01)
    expect(g.sent()).toEqual([release(true)])
    const tray = g.v.hud.tray!
    // The finger on the tray's top edge holds the oven over the board: lifted there it is placed.
    g.down(2, 9.5, 10.5, T0 + 1)
    g.r.move(g.s, g.v, 2, tray.x + 300, tray.y + 4, T0 + 1.1)
    g.r.up(g.s, g.v, 2, tray.x + 300, tray.y + 4, T0 + 1.2)
    g.tick(T0 + 1.2 + BRIDGE + 0.01)
    expect(g.sent().at(-1)).toEqual(release(true))
    // Low in the tray, the oven itself is over the tray: it goes back.
    g.down(3, 9.5, 10.5, T0 + 2)
    g.r.move(g.s, g.v, 3, tray.x + 300, tray.y + tray.h - 4, T0 + 2.1)
    g.r.up(g.s, g.v, 3, tray.x + 300, tray.y + tray.h - 4, T0 + 2.2)
    const got = g.sent()
    expect(got.map((a) => a.kind)).toEqual(['hold', 'hold', 'release'])
    expect(got.at(-1)).toEqual(release(false))
    // A tower rides 0.65 cell up; upright the footprint's middle is up the screen all the same.
    g.s.tool = { kind: 'sticker', sticker: 'tower' }
    g.down(4, 9.5, 10.5, T0 + 3)
    expect(g.sent()).toEqual([hold(g, 9.5, 10.5, 1)])
    const up = rig(820, 1180)
    up.s.tool = OVEN
    up.down(1, 9.5, 6.5, T0)
    const [fx, fy] = toScreen(up.v, 9.5, 6.5)
    const h = up.sent()[0] as { x: number; y: number }
    const [hx, hy] = toScreen(up.v, h.x, h.y)
    expect([hx - fx, hy - fy].map((d) => d / up.v.cell)).toEqual([expect.closeTo(0, 9), expect.closeTo(-1.15, 9)])
  })

  it('picks a sticker dragged out of the tray onto the board and holds its ghost; lifted in the tray it leaves the button its own tap', () => {
    const g = rig()
    const tray = g.v.hud.tray!
    g.r.tray(g.s, g.v, 1, 'oven', tray.x + 300, tray.y + 40, T0, 'touch')
    g.r.move(g.s, g.v, 1, tray.x + 300, tray.y + 10, T0 + 0.05)
    expect(g.got.splice(0)).toEqual([])
    g.move(1, 9.5, 10.5, T0 + 0.1)
    expect(g.got.splice(0)).toEqual([{ kind: 'touch', down: true }, { kind: 'tool', tool: OVEN }, hold(g, 9.5, 10.5, 2)])
    g.up(1, 9.5, 10.5, T0 + 0.2)
    g.tick(T0 + 0.5)
    expect(g.sent()).toEqual([release(true)])
    // Already picked, it is not picked again; back low over the tray it goes back.
    g.s.tool = OVEN
    g.r.tray(g.s, g.v, 2, 'oven', tray.x + 300, tray.y + 40, T0 + 1, 'touch')
    g.move(2, 9.5, 10.5, T0 + 1.1)
    g.r.up(g.s, g.v, 2, tray.x + 300, tray.y + tray.h - 4, T0 + 1.2)
    expect(g.sent()).toEqual([hold(g, 9.5, 10.5, 2), { kind: 'hold', x: expect.any(Number), y: expect.any(Number) }, release(false)])
    g.r.tray(g.s, g.v, 3, 'digger', tray.x + 300, tray.y + 40, T0 + 2, 'touch')
    g.r.up(g.s, g.v, 3, tray.x + 300, tray.y + 40, T0 + 2.2)
    expect(g.got.splice(0)).toEqual([])
  })

  it("draws a hedge line when the hedge's button is dragged out of the tray, from the first open cell the finger enters", () => {
    const g = rig()
    const tray = g.v.hud.tray!
    g.r.tray(g.s, g.v, 1, 'hedge', tray.x + 300, tray.y + 40, T0, 'touch')
    // Out of the tray but still over the table west of the board: the line has not begun.
    expect(toBoard(g.v, 40, tray.y - 100)[0]).toBeLessThan(0)
    g.r.move(g.s, g.v, 1, 40, tray.y - 100, T0 + 0.05)
    expect(g.got.splice(0)).toEqual([{ kind: 'touch', down: true }, { kind: 'tool', tool: { kind: 'hedge' } }])
    g.move(1, 9.5, 11.5, T0 + 0.1)
    g.move(1, 11.5, 11.5, T0 + 0.2)
    g.up(1, 11.5, 11.5, T0 + 0.3)
    g.tick(T0 + 0.3 + BRIDGE + 0.01)
    expect(g.sent()).toEqual([drag([c(9, 11)]), drag(row(11, 9, 11)), release(true)])
  })

  it("places the hint's sticker ghost on a tap, and a drag from it picks the sticker: a finger holds it by its bottom edge, the mouse where it took hold of it", () => {
    const g = rig()
    g.s.hint = { step: { kind: 'place', sticker: 'digger', x: 7, y: 2 }, at: g.s.tick }
    g.down(1, 7.25, 2.25, T0)
    g.up(1, 7.25, 2.25, T0 + 0.3)
    expect(g.sent()).toEqual([{ kind: 'tap', hit: { kind: 'spot' } }])
    g.down(2, 7.25, 2.25, T0 + 1)
    g.move(2, 7.5, 2.25, T0 + 1.05)
    expect(g.sent()).toEqual([])
    g.move(2, 7.75, 2.25, T0 + 1.1)
    expect(g.sent()).toEqual([{ kind: 'tool', tool: { kind: 'sticker', sticker: 'digger' } }, hold(g, 7.75, 2.25, 2)])
    g.r.cancel(2, T0 + 1.2)
    g.sent()
    g.down(3, 7.25, 2.25, T0 + 2, 'left')
    g.move(3, 7.75, 2.25, T0 + 2.1)
    expect(g.sent()).toEqual([{ kind: 'tool', tool: { kind: 'sticker', sticker: 'digger' } }, { kind: 'hold', x: 8.5, y: 3 }])
    g.move(3, 9.25, 4.25, T0 + 2.2)
    g.up(3, 9.25, 4.25, T0 + 2.3)
    g.tick(T0 + 2.5)
    expect(g.sent()).toEqual([{ kind: 'hold', x: 10, y: 5 }, release(true)])
  })
})

describe('feedback above the fingertip', () => {
  it('tells the renderer where the finger drawing or holding a ghost is, and floats the feedback 0.8 cell and at least 44 px above it', () => {
    const g = rig()
    expect(fingerLift(g.v)).toBe(44)
    expect(fingerLift({ ...g.v, cell: 71 })).toBeCloseTo(56.8, 9)
    g.down(1, 2.5, 10.5, T0)
    expect(g.r.finger).toBeNull()
    g.move(1, 4.5, 10.5, T0 + 0.1)
    const [x, y] = toScreen(g.v, 4.5, 10.5)
    expect(g.r.finger).toEqual({ x, y, touch: true })
    g.up(1, 4.5, 10.5, T0 + 0.2)
    g.tick(T0 + 0.5)
    expect(g.r.finger).toBeNull()
    // The mouse's ghost: no hand covers it.
    g.s.tool = OVEN
    g.down(2, 9.5, 10.5, T0 + 1, 'left')
    const [mx, my] = toScreen(g.v, 9.5, 10.5)
    expect(g.r.finger).toEqual({ x: mx, y: my, touch: false })
  })
})

describe('the lift bridge', () => {
  it('goes on with the same stroke when a touch comes within BRIDGE and a cell of the lift, and lays it once', () => {
    const g = rig()
    g.down(1, 2.5, 10.5, T0)
    g.move(1, 5.5, 10.5, T0 + 0.1)
    g.up(1, 5.5, 10.5, T0 + 0.2)
    g.down(2, 6.25, 10.5, T0 + 0.2 + BRIDGE - 0.02)
    g.move(2, 8.5, 10.5, T0 + 0.5)
    g.up(2, 8.5, 10.5, T0 + 0.6)
    g.tick(T0 + 0.6 + BRIDGE + 0.01)
    expect(g.sent()).toEqual([drag(row(10, 2, 5)), drag(row(10, 2, 6)), drag(row(10, 2, 8)), release(true)])
    // A ghost too.
    g.s.tool = OVEN
    g.down(3, 9.5, 8.5, T0 + 2)
    g.up(3, 9.5, 8.5, T0 + 2.1)
    g.down(4, 10, 8.5, T0 + 2.2)
    g.up(4, 10, 8.5, T0 + 2.3)
    g.tick(T0 + 2.6)
    expect(g.sent()).toEqual([hold(g, 9.5, 8.5, 2), hold(g, 10, 8.5, 2), release(true)])
  })

  it('goes on with a stroke whose fingertip skipped beside a muncher: the bridge comes before the tickle, and every new touch there still tickles', () => {
    const g = rig()
    muncher(g, 5, 11, 10, 'sit')
    let t = T0
    g.down(1, 2.5, 9.5, t)
    for (let x = 2.5; x <= 10.3; x += 0.1) g.move(1, x, 9.5, (t += 0.01))
    // The fingertip skips off the glass for 60 ms by the muncher and lands again 0.1 cell on.
    g.up(1, 10.3, 9.5, (t += 0.01))
    g.tick((t += 0.03))
    g.down(2, 10.4, 9.5, (t += 0.03))
    for (let x = 10.4; x <= 16.5; x += 0.1) {
      g.move(2, x, 9.5, (t += 0.01))
      g.tick(t)
    }
    g.up(2, 16.5, 9.5, (t += 0.01))
    g.tick((t += BRIDGE + 0.02))
    const got = g.sent()
    expect(got.some((a) => a.kind === 'tickle')).toBe(false)
    expect(got.at(-2)).toEqual(drag(row(9, 2, 16)))
    expect(got.at(-1)).toEqual(release(true))
    // A new touch there, with no stroke lifted a moment ago, tickles.
    g.down(3, 10.4, 9.5, (t += 1))
    expect(g.sent()).toEqual([{ kind: 'tickle', id: 5 }])
  })

  it('goes on with the stroke when the touch comes in the frame right after the lift, however long that frame was (?fast), and lays it at the tick after when none does', () => {
    const g = rig()
    g.down(1, 2.5, 10.5, T0)
    g.move(1, 5.5, 10.5, T0 + 0.1)
    g.up(1, 5.5, 10.5, T0 + 0.2)
    // At ?fast=10 a frame is a sixth of a second of the sim, longer than BRIDGE.
    const frame = 1 / 6
    g.tick(T0 + 0.2)
    g.down(2, 6.25, 10.5, T0 + 0.2 + frame)
    g.move(2, 8.5, 10.5, T0 + 0.2 + frame)
    g.up(2, 8.5, 10.5, T0 + 0.2 + frame)
    g.tick(T0 + 0.2 + frame)
    expect(g.sent()).toEqual([drag(row(10, 2, 5)), drag(row(10, 2, 6)), drag(row(10, 2, 8))])
    g.tick(T0 + 0.2 + 2 * frame)
    expect(g.sent()).toEqual([release(true)])
  })

  it('lays the stroke first when the next touch is too late or too far, and that touch is its own', () => {
    const g = rig()
    g.down(1, 2.5, 10.5, T0)
    g.move(1, 5.5, 10.5, T0 + 0.1)
    g.up(1, 5.5, 10.5, T0 + 0.2)
    g.down(2, 9.5, 9.5, T0 + 0.25)
    g.up(2, 9.5, 9.5, T0 + 0.35)
    expect(g.sent()).toEqual([drag(row(10, 2, 5)), release(true), { kind: 'tap', hit: { kind: 'ground', cell: c(9, 9) } }])
    g.down(3, 2.5, 10.5, T0 + 1)
    g.move(3, 5.5, 10.5, T0 + 1.1)
    g.up(3, 5.5, 10.5, T0 + 1.2)
    g.down(4, 5.75, 10.5, T0 + 1.2 + BRIDGE + 0.01)
    g.up(4, 5.75, 10.5, T0 + 1.5)
    expect(g.sent()).toEqual([drag(row(10, 2, 5)), release(true), { kind: 'tap', hit: { kind: 'ground', cell: c(5, 10) } }])
  })
})

describe('one finger on the board', () => {
  it('lets a second finger only tickle while the first draws', () => {
    const g = rig()
    muncher(g, 5, 15, 11, 'sit')
    g.down(1, 2.5, 10.5, T0)
    g.move(1, 4.5, 10.5, T0 + 0.1)
    g.down(2, 9.5, 8.5, T0 + 0.2)
    g.move(2, 12.5, 8.5, T0 + 0.3)
    g.up(2, 12.5, 8.5, T0 + 0.4)
    g.down(3, 15.5, 11.2, T0 + 0.5)
    g.move(1, 6.5, 10.5, T0 + 0.6)
    expect(g.sent()).toEqual([drag(row(10, 2, 4)), { kind: 'tickle', id: 5 }, drag(row(10, 2, 6))])
  })

  it('hands the board at once from a finger that started nothing to the next one that lands: a resting thumb or heel never takes her stroke, and its own slide draws nothing', () => {
    const g = rig()
    // The heel of her hand lands by the tray; her fingertip 0.3 s later draws along row 9.
    g.down(1, 3.5, 11.5, T0)
    g.down(2, 5.5, 9.5, T0 + 0.3)
    for (let k = 1; k <= 20; k++) g.move(2, 5.5 + k * 0.2, 9.5, T0 + 0.3 + k * 0.02)
    g.up(2, 9.5, 9.5, T0 + 0.8)
    g.tick(T0 + 1.2)
    expect(g.sent()).toEqual([drag(row(9, 5, 6)), drag(row(9, 5, 7)), drag(row(9, 5, 8)), drag(row(9, 5, 9)), release(true)])
    // The heel rolls 36 px as she leans and lifts: it is done, and draws and taps nothing.
    g.move(1, 4.2, 11.5, T0 + 1.5)
    g.up(1, 4.2, 11.5, T0 + 1.6)
    g.tick(T0 + 2)
    expect(g.sent()).toEqual([])
  })

  it('hands the board at once from a thumb resting on a patch or the pond, its dig ended there: a thumb that dug never freezes the game', () => {
    const g = rig()
    // The pond at the board's west edge, where a hand holding the iPad rests its thumb.
    g.down(1, 0.5, 8.5, T0)
    expect(g.sent()).toEqual([{ kind: 'dig', cell: c(0, 8), down: true }])
    g.down(2, 9.5, 10.5, T0 + 0.1)
    expect(g.sent()).toEqual([{ kind: 'dig', cell: c(0, 8), down: false }])
    g.move(2, 12.5, 10.5, T0 + 0.2)
    expect(g.sent()).toEqual([drag(row(10, 9, 12))])
    // Its lift digs and taps nothing more.
    g.up(1, 0.5, 8.5, T0 + 2)
    expect(g.sent()).toEqual([])
  })

  it('never gives the board to a contact too wide for a fingertip, first or not, and nothing it lands on answers', () => {
    const g = rig()
    muncher(g, 5, 15, 11, 'sit')
    // On the ground, on a muncher, on a patch.
    const heels = [
      [3.5, 11.5],
      [15.5, 11.2],
      [17.5, 11.5],
    ] as const
    heels.forEach(([x, y], i) => g.down(10 + i, x, y, T0, 'heel'))
    g.down(1, 5.5, 9.5, T0 + 0.1)
    g.move(1, 8.5, 9.5, T0 + 0.2)
    heels.forEach(([x, y], i) => {
      g.move(10 + i, x + 2, y, T0 + 0.3)
      g.up(10 + i, x + 2, y, T0 + 0.4)
    })
    expect(g.got.splice(0)).toEqual([{ kind: 'touch', down: true }, drag(row(9, 5, 8))])
  })

  it('never gives the board to a touch in a gutter or on the table round the board', () => {
    const g = rig()
    g.r.down(g.s, g.v, 1, 8, 400, T0, 'touch')
    g.down(2, 9.5, 10.5, T0 + 0.1)
    g.move(2, 11.5, 10.5, T0 + 0.2)
    g.r.move(g.s, g.v, 1, 300, 400, T0 + 0.3)
    g.r.up(g.s, g.v, 1, 300, 400, T0 + 0.4)
    expect(g.sent()).toEqual([drag(row(10, 9, 11))])
    expect(g.got).toEqual([])
  })
})

describe('letting go', () => {
  it('drops a stroke or a ghost with nothing placed on a cancel, a window turn, a page hide or a pause, and forgets every finger', () => {
    const g = rig()
    g.down(1, 2.5, 10.5, T0)
    g.move(1, 4.5, 10.5, T0 + 0.1)
    g.r.cancel(1, T0 + 0.2)
    expect(g.sent()).toEqual([drag(row(10, 2, 4)), release(false)])
    g.down(2, 2.5, 10.5, T0 + 1)
    g.move(2, 4.5, 10.5, T0 + 1.1)
    g.got.splice(0)
    g.r.drop()
    expect(g.got.splice(0)).toEqual([release(false), { kind: 'touch', down: false }])
    g.move(2, 6.5, 10.5, T0 + 1.2)
    g.up(2, 6.5, 10.5, T0 + 1.3)
    g.tick(T0 + 2)
    expect(g.got.splice(0)).toEqual([])
    // A lifted stroke waiting on its bridge, and a dig.
    g.down(3, 2.5, 10.5, T0 + 3)
    g.move(3, 4.5, 10.5, T0 + 3.1)
    g.up(3, 4.5, 10.5, T0 + 3.2)
    g.r.drop()
    g.down(4, 17.5, 11.5, T0 + 3.3)
    g.r.drop()
    expect(g.sent()).toEqual([drag(row(10, 2, 4)), release(false), { kind: 'dig', cell: c(17, 11), down: true }, { kind: 'dig', cell: c(17, 11), down: false }])
  })

  it('takes no board input on a phone held upright, which shows the turn-me picture', () => {
    const g = rig(390, 844)
    expect(g.v.hud.held).toBe('turnMe')
    g.down(1, 9.5, 10.5, T0)
    g.move(1, 12.5, 10.5, T0 + 0.1)
    g.up(1, 12.5, 10.5, T0 + 0.2)
    expect(g.sent()).toEqual([])
  })
})

describe('the turn at the lift', () => {
  /** A stroke east along row 10 from (2.5, 10.5) to (8.5, 10.5), turning down to lift at (8.5 + ex, 11.5 + ey): the cells of the last drag it sent. */
  function endTurn(g: ReturnType<typeof rig>, ex: number, ey: number, t: number): number[] {
    g.down(1, 2.5, 10.5, t)
    for (let x = 2.5; x <= 8.5; x += 0.1) g.move(1, x, 10.5, (t += 0.01))
    for (let i = 1; i <= 10; i++) g.move(1, 8.5 + (ex * i) / 10, 10.5 + ((1 + ey) * i) / 10, (t += 0.01))
    g.up(1, 8.5 + ex, 11.5 + ey, (t += 0.01))
    g.tick(t + BRIDGE + 0.01)
    const drags = g.sent().filter((a): a is Extract<Action, { kind: 'drag' }> => a.kind === 'drag')
    return drags.at(-1)!.cells
  }

  it('takes the cell under the lifted finger next to the stroke\'s end when the stroke then goes into a mouth or a belt\'s side, however little the finger is in it', () => {
    const g = rig()
    // West along row 5, the finger dipping 0.2 cell into the start oven's top row as it lifts.
    let t = T0
    g.down(1, 11.5, 5.5, t)
    for (let x = 11.5; x >= 6.5; x -= 0.1) g.move(1, x, 5.5, (t += 0.01))
    g.move(1, 6.5, 6.2, (t += 0.01))
    g.up(1, 6.5, 6.2, (t += 0.01))
    expect(g.sent().filter((a) => a.kind === 'drag').at(-1)).toEqual(drag([...row(5, 11, 6), c(6, 6)]))
    // East along row 10 over a belt running east along row 11: the finger 0.05 cell into it joins it.
    belt(g, row(11, 4, 10), 0)
    expect(endTurn(g, 0, -0.45, T0 + 2).at(-1)).toBe(c(8, 11))
  })

  it('takes a turn onto open ground once the finger is END_TURN cells into it', () => {
    const g = rig()
    expect(endTurn(g, 0, END_TURN - 0.5 - 0.05, T0).at(-1)).toBe(c(8, 10))
    expect(endTurn(g, 0, END_TURN - 0.5 + 0.05, T0 + 2).at(-1)).toBe(c(8, 11))
  })

  it("loses a stroke's last one-cell turn under one time in twenty with the plan's finger, its end scattered round the cell it means", () => {
    for (const [w, h] of [
      [1024, 768],
      [1180, 820],
    ] as const) {
      const g = rig(w, h)
      const next = rng(7)
      const normal = () => Math.sqrt(-2 * Math.log(1 - next())) * Math.cos(2 * Math.PI * next())
      // The plan's taps: an RMS radius of 2.5 mm, so 1.77 mm on each axis, at an iPad's CSS px per mm.
      const sigma = (1.77 * (132 / 25.4)) / g.v.cell
      let lost = 0
      const n = 400
      for (let i = 0; i < n; i++) if (yOf(endTurn(g, normal() * sigma, normal() * sigma, T0 + 3 * i).at(-1)!) !== 11) lost++
      expect(lost / n, `${w}x${h}`).toBeLessThan(0.05)
    }
  })
})

describe('a press on a thing riding a belt', () => {
  it('follows the thing through each hop until the lift, so the lift carries the thing she pressed', () => {
    for (const hold of [0.1, 0.5, 0.8]) {
      const g = live()
      belt(g, row(10, 1, 14), 0)
      rebuild(g.s)
      while (g.s.tick % HOP !== 1) step(g.s)
      const slot = inSlot(c(4, 10))
      g.s.belts.slot[slot] = thingIndex('gear')
      const T = () => g.s.tick * STEP
      const p = thingPoint(g.s, slot, T())
      g.r.down(g.s, g.v, 1, ...toScreen(g.v, p.x, p.y), T(), 'touch')
      for (let i = 0; i < Math.round(hold / STEP); i++) {
        step(g.s)
        g.r.tick(g.s, g.v, T())
      }
      const sent = g.got.length
      g.r.up(g.s, g.v, 1, ...toScreen(g.v, p.x, p.y), T())
      const tap = g.got.slice(sent).find((a) => a.kind === 'tap') as Extract<Action, { kind: 'tap' }>
      expect(tap.hit.kind, `held ${hold} s`).toBe('thing')
      expect([...g.s.belts.slot].some((x) => x >= 0 && THINGS[x] === 'gear'), `held ${hold} s: Beep took the gear`).toBe(false)
    }
  })
})

describe('the other hand', () => {
  for (const tool of [{ kind: 'peel' }, { kind: 'pencil' }, { kind: 'sticker', sticker: 'digger' }] as const)
    it(`lets go of a stroke when the other hand picks ${tool.kind === 'sticker' ? 'a sticker' : `the ${tool.kind}`} mid-stroke: what it draws on is never that tool's`, () => {
      const g = live()
      // Diggers and hedges in the tray.
      g.s.found = ['gold', 'hedges']
      let t = T0
      // Her belt along row 10, east.
      g.down(1, 1.5, 10.5, t)
      for (let x = 1.5; x <= 10.5; x += 0.1) g.move(1, x, 10.5, (t += 0.01))
      g.up(1, 10.5, 10.5, (t += 0.01))
      g.tick((t += BRIDGE + 0.02))
      const before = row(10, 1, 10).map((cell) => g.s.belts.out[cell])
      // A new stroke from the ground down onto her belt and along it.
      g.s.tool = tool.kind === 'pencil' ? { kind: 'hedge' } : { kind: 'pencil' }
      g.down(2, 3.5, 8.5, (t += 1))
      g.move(2, 3.5, 9.5, (t += 0.05))
      g.move(2, 3.5, 10.5, (t += 0.05))
      act(g.s, { kind: 'tool', tool })
      g.got.length = 0
      for (let x = 3.5; x <= 9.5; x += 0.1) g.move(2, x, 10.5, (t += 0.01))
      g.up(2, 9.5, 10.5, (t += 0.01))
      g.tick((t += BRIDGE + 0.02))
      expect(g.got.filter((a) => a.kind !== 'touch')).toEqual([])
      expect(row(10, 1, 10).map((cell) => g.s.belts.out[cell])).toEqual(before)
      expect(g.s.hedge.every((x) => x === 0)).toBe(true)
    })

  it('lets go of a held ghost when the other hand picks another sticker, which is never placed where the finger lifts', () => {
    const g = live()
    g.s.found = ['gold']
    g.s.tool = OVEN
    g.down(1, 9.5, 10.5, T0)
    g.move(1, 10.5, 10.5, T0 + 0.1)
    act(g.s, { kind: 'tool', tool: { kind: 'sticker', sticker: 'digger' } })
    g.move(1, 12.5, 10.5, T0 + 0.2)
    g.up(1, 12.5, 10.5, T0 + 0.3)
    g.tick(T0 + 0.3 + BRIDGE + 0.01)
    expect(g.s.buildings.map((b) => b.kind)).toEqual(['pad', 'oven'])
  })
})

describe('the launch', () => {
  it('takes only taps while the rocket flies: a tap on the pad is the pad\'s, a drag draws nothing, a patch is no dig, and the tray takes no press', () => {
    const g = rig()
    g.s.launch = { at: g.s.tick, landsAt: g.s.tick + 2400 }
    g.down(1, 2.5, 5.5, T0)
    g.up(1, 2.5, 5.5, T0 + 0.2)
    g.down(2, 9.5, 10.5, T0 + 1)
    g.move(2, 13.5, 10.5, T0 + 1.1)
    g.up(2, 13.5, 10.5, T0 + 1.2)
    g.down(3, 17.5, 11.5, T0 + 2)
    g.up(3, 17.5, 11.5, T0 + 2.1)
    const tray = g.v.hud.tray!
    g.r.tray(g.s, g.v, 4, 'oven', tray.x + 300, tray.y + 40, T0 + 3, 'touch')
    g.move(4, 9.5, 10.5, T0 + 3.1)
    g.up(4, 9.5, 10.5, T0 + 3.2)
    g.tick(T0 + 4)
    expect(g.sent()).toEqual([
      { kind: 'tap', hit: { kind: 'building', id: 0 } },
      { kind: 'tap', hit: { kind: 'patch', cell: c(17, 11) } },
    ])
  })
})

describe('munchers', () => {
  it('tickles a muncher on the down with any tool, and the touch never draws, places, peels or puts the tool back', () => {
    const g = rig()
    muncher(g, 5, 9, 9, 'sit')
    for (const tool of [PENCIL, OVEN, { kind: 'peel' }, { kind: 'hedge' }] as const) {
      g.s.tool = tool
      g.down(1, 9.5, 9.2, T0)
      g.move(1, 12.5, 9.2, T0 + 0.1)
      g.move(1, 12.5, 11.5, T0 + 0.2)
      g.up(1, 12.5, 11.5, T0 + 0.3)
      g.tick(T0 + 1)
      expect(g.sent(), tool.kind).toEqual([{ kind: 'tickle', id: 5 }])
      expect(g.s.tool).toBe(tool)
    }
    // Napping: anywhere on the machine.
    g.s.tool = PENCIL
    const oven = g.s.buildings[1]!
    oven.napper = 6
    muncher(g, 6, 6, 6, 'nap')
    g.down(2, 6.1, 7.9, T0 + 2)
    g.up(2, 6.1, 7.9, T0 + 2.1)
    expect(g.sent()).toEqual([{ kind: 'tickle', id: 6 }])
  })

  it('never draws, places or peels from a touch aimed at a muncher, whatever the finger does after', () => {
    const g = rig()
    const next = rng(7)
    // Three munchers about the factory: sitting on a belt, walking, hopping home.
    belt(g, row(10, 3, 12), 0)
    for (let x = 3; x <= 12; x++) g.s.belts.slot[inSlot(c(x, 10))] = thingIndex('greenBottle')
    muncher(g, 1, 8, 10, 'sit')
    const walker = muncher(g, 2, 4, 8, 'walk')
    walker.toward = c(5, 8)
    walker.stepAt = g.s.tick - 20
    const hopper = muncher(g, 3, 12, 5, 'home')
    hopper.hop = { x0: 8.5, y0: 5.5, x1: 12.5, y1: 3.5, at: g.s.tick - 30, until: g.s.tick + 90 }
    const tools: Tool[] = [PENCIL, OVEN, { kind: 'peel' }, { kind: 'hedge' }, { kind: 'sticker', sticker: 'tower' }]
    let t = T0
    for (let i = 0; i < 300; i++) {
      g.s.tool = tools[i % tools.length]!
      const m = g.s.munchers[i % 3]!
      // Aimed at its body as drawn now, scattered up to 60 px: a five-year-old's frantic tap.
      const p = muncherPoint(m, t)
      const [fx, fy] = toScreen(g.v, p.x, p.y)
      const a = next() * Math.PI * 2
      const d = next() * 50
      const sx = fx + Math.cos(a) * d
      const sy = fy - (0.38 + p.lift) * g.v.cell + Math.sin(a) * d
      const press: Press = next() < 0.1 ? 'right' : 'touch'
      g.r.down(g.s, g.v, 100 + i, sx, sy, t, press)
      let x = sx
      let y = sy
      for (let k = 0; k < 4; k++) g.r.move(g.s, g.v, 100 + i, (x += (next() - 0.5) * 160), (y += (next() - 0.5) * 160), (t += 0.05))
      if (next() < 0.2) g.r.cancel(100 + i, (t += 0.05))
      else g.r.up(g.s, g.v, 100 + i, x, y, (t += 0.05))
      g.r.tick(g.s, g.v, (t += 0.3))
      for (const act of g.sent()) expect(act.kind, `touch ${i}`).toBe('tickle')
    }
  })
})

describe('the mouse', () => {
  it("reads a right click as the peel's first tap and a right drag as rolling up", () => {
    const g = rig()
    belt(g, row(10, 3, 9), 0)
    g.down(1, 5.5, 10.5, T0, 'right')
    g.up(1, 5.5, 10.5, T0 + 0.1)
    expect(g.sent()).toEqual([{ kind: 'tool', tool: { kind: 'peel' } }, { kind: 'tap', hit: { kind: 'belt', cell: c(5, 10) } }])
    // With the peel already picked a second right click is its second tap.
    g.s.tool = { kind: 'peel' }
    g.down(2, 5.5, 10.5, T0 + 1, 'right')
    g.up(2, 5.5, 10.5, T0 + 1.1)
    expect(g.sent()).toEqual([{ kind: 'tap', hit: { kind: 'belt', cell: c(5, 10) } }])
    g.s.tool = PENCIL
    g.down(3, 3.5, 10.5, T0 + 2, 'right')
    g.move(3, 7.5, 10.5, T0 + 2.1)
    g.up(3, 7.5, 10.5, T0 + 2.2)
    g.tick(T0 + 2.5)
    expect(g.sent()).toEqual([{ kind: 'tool', tool: { kind: 'peel' } }, drag(row(10, 3, 7)), release(true)])
  })

  it("names what the mouse hovers over, and lets a picked sticker's ghost follow it until it leaves", () => {
    const g = rig()
    const at = (x: number, y: number) => g.r.hoverAt(g.s, g.v, ...toScreen(g.v, x, y), T0)
    at(6.5, 6.5)
    expect(g.r.hover).toEqual({ kind: 'building', id: 1 })
    at(9.5, 10.5)
    expect(g.r.hover).toEqual({ kind: 'ground', cell: c(9, 10) })
    expect(g.sent()).toEqual([])
    g.s.tool = OVEN
    at(9.5, 10.5)
    at(10.5, 10.5)
    expect(g.sent()).toEqual([{ kind: 'hold', x: 9.5, y: 10.5 }, { kind: 'hold', x: 10.5, y: 10.5 }])
    g.r.leave()
    expect([g.r.hover, g.sent()]).toEqual([null, [release(false)]])
    // A click places the ghost that followed the mouse.
    at(9.5, 10.5)
    g.down(1, 9.5, 10.5, T0 + 1, 'left')
    g.up(1, 9.5, 10.5, T0 + 1.1)
    g.tick(T0 + 1.5)
    g.r.leave()
    expect(g.sent()).toEqual([{ kind: 'hold', x: 9.5, y: 10.5 }, { kind: 'hold', x: 9.5, y: 10.5 }, release(true)])
  })
})

describe('the keys', () => {
  it('picks the kinds with 1 to 9 and the tools with B, H and X, Oops with Z or Ctrl+Z, and leaves other Ctrl keys alone', () => {
    const s = blankState(1)
    expect(keyAction(s, 0, 'Digit1', false, MIDDLE)).toEqual({ kind: 'tool', tool: { kind: 'sticker', sticker: 'digger' } })
    expect(keyAction(s, 0, 'Digit2', false, MIDDLE)).toEqual({ kind: 'tool', tool: OVEN })
    expect(keyAction(s, 0, 'Numpad9', false, MIDDLE)).toEqual({ kind: 'tool', tool: { kind: 'sticker', sticker: 'bowl' } })
    expect(keyAction(s, 0, 'Digit0', false, MIDDLE)).toBeNull()
    expect(keyAction(s, 0, 'KeyB', false, MIDDLE)).toEqual({ kind: 'pattern' })
    s.tool = OVEN
    expect(keyAction(s, 0, 'KeyB', false, MIDDLE)).toEqual({ kind: 'tool', tool: PENCIL })
    expect(keyAction(s, 0, 'KeyH', false, MIDDLE)).toEqual({ kind: 'tool', tool: { kind: 'hedge' } })
    expect(keyAction(s, 0, 'KeyX', false, MIDDLE)).toEqual({ kind: 'tool', tool: { kind: 'peel' } })
    expect(keyAction(s, 0, 'KeyZ', false, MIDDLE)).toEqual({ kind: 'oops' })
    expect(keyAction(s, 0, 'KeyZ', true, MIDDLE)).toEqual({ kind: 'oops' })
    expect(keyAction(s, 0, 'KeyB', true, MIDDLE)).toBeNull()
    expect(keyAction(s, 0, 'KeyQ', false, MIDDLE)).toBeNull()
  })

  it('tickles the muncher nearest the middle with Space, presses Play and closes a card with Enter, and gives the shell Esc, P, M and F', () => {
    const g = rig()
    const s = g.s
    expect(keyAction(s, T0, 'Space', false, MIDDLE)).toBeNull()
    muncher(g, 1, 1, 1, 'walk')
    muncher(g, 2, 15, 9, 'sit')
    muncher(g, 3, 10, 6, 'home')
    expect(keyAction(s, T0, 'Space', false, MIDDLE)).toEqual({ kind: 'tickle', id: 2 })
    expect(keyAction(s, T0, 'Enter', false, MIDDLE)).toEqual({ kind: 'play' })
    s.playing = true
    expect(keyAction(s, T0, 'Enter', false, MIDDLE)).toBeNull()
    s.card = { id: 'gold', at: s.tick }
    expect(keyAction(s, T0, 'Enter', false, MIDDLE)).toEqual({ kind: 'card' })
    expect(keyAction(s, T0, 'Escape', false, MIDDLE)).toBe('pause')
    expect(keyAction(s, T0, 'KeyP', false, MIDDLE)).toBe('pause')
    expect(keyAction(s, T0, 'KeyF', false, MIDDLE)).toBe('fullscreen')
    expect(keyAction(s, T0, 'KeyM', false, MIDDLE)).toEqual({ kind: 'sound', on: false })
    s.switches.sound = false
    expect(keyAction(s, T0, 'KeyM', false, MIDDLE)).toEqual({ kind: 'sound', on: true })
  })
})
