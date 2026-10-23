/**
 * The board on the screen: the HUD's frame and the cell sizes at the plan's screens (the iPads
 * in full screen, Safari's with its bars, a phone on its side), the board-to-screen map with
 * the upright quarter turn, and what a touch lands on, case by case in the plan's hit order
 * (plans/rocket-factory.md, The board and the view, Beep and the child's hands, The HUD).
 */
import { describe, expect, it } from 'vitest'

import { BURROWS, cellOf } from './board'
import { owners } from './belts'
import { viewAt } from './camera'
import { GHOST_DELAY, HELP_FULL } from './catalog'
import { GRIP, GUTTER, MUNCHER_REACH, NO_INSETS, RANK, SLOP, STRIP, TRAY_LIFT, TRAY_PAD, fingerFor, fitCell, heldAt, hintGhost, hitTest, hudFrame, landBox, muncherDrawn, muncherReach, onButton, pictureDoor, pictureSpot, screenBox, targets, toBoard, toScreen, trayBoxes, type Insets, type View } from './layout'
import { STEP, inSlot, newBuilding, outSlot, thingIndex, ticks, type Dir, type Hit, type Kind, type Muncher, type MuncherMode, type State, type Thing } from './model'
import { FINGER, SCREENS as CHILD_SCREENS, landing, off } from './child'
import { rng } from './random'
import { blankState } from './rules'
import { heapPoint, moonyPoint, muncherPoint } from './where'

/** The home indicator's inset on the iPads without a home button (the 10.9-inch Air, 1180x820). */
const HOME: Insets = { ...NO_INSETS, bottom: 20 }

/** The plan's screens and what land 3's cells come to on each: the iPads in full screen, Safari's with its bars, and a notched phone on its side inside its insets. */
const SCREENS = [
  { name: 'Air 1180x820', w: 1180, h: 820, safe: HOME, land3: 52 },
  { name: 'iPad 1024x768', w: 1024, h: 768, safe: NO_INSETS, land3: 49 },
  { name: 'Air upright 820x1180', w: 820, h: 1180, safe: HOME, land3: 50 },
  { name: 'Safari 1024x662', w: 1024, h: 662, safe: NO_INSETS, land3: 41 },
  { name: 'Safari 1180x710', w: 1180, h: 710, safe: HOME, land3: 43 },
  { name: 'Safari upright 820x1070', w: 820, h: 1070, safe: HOME, land3: 44 },
  { name: 'phone 750x320', w: 750, h: 320, safe: NO_INSETS, land3: 25 },
] as const

describe('the HUD and the cells', () => {
  it("fits land 3's cells to the plan's screens, whole px, as big as the HUD allows", () => {
    for (const sc of SCREENS) expect(fitCell(hudFrame(sc.w, sc.h, true, sc.safe), 3), sc.name).toBe(sc.land3)
    // The plan's 53 and 50 for the Air assumed no home indicator: without its inset the Air is 54 sideways and 51 upright.
    expect(fitCell(hudFrame(1180, 820, true, NO_INSETS), 3)).toBe(54)
    expect(fitCell(hudFrame(820, 1180, true, NO_INSETS), 3)).toBe(51)
    // Lands 1 and 2 are bigger, with room for the next land's flaps.
    for (const sc of SCREENS) {
      const hud = hudFrame(sc.w, sc.h, true, sc.safe)
      expect(fitCell(hud, 1), sc.name).toBeGreaterThan(fitCell(hud, 2))
      expect(fitCell(hud, 2), sc.name).toBeGreaterThan(fitCell(hud, 3))
    }
    expect([1, 2].map((land) => fitCell(hudFrame(1024, 768, true, NO_INSETS), land as 1 | 2))).toEqual([69, 56])
  })

  it('keeps a 64 px strip, a tray 16 px plus the bottom inset over the edge with 72, 64 or 60 px buttons, and 20 px gutters on a touch screen', () => {
    const air = hudFrame(1180, 820, true, HOME)
    expect(air.held).toBe('sideways')
    expect(air.strip).toEqual({ x: 0, y: 0, w: 1180, h: STRIP })
    expect([air.button, air.tray!.h, air.gap]).toEqual([72, 88, 10])
    expect(air.tray!.y + air.tray!.h).toBe(820 - 20 - TRAY_LIFT)
    expect(air.free).toEqual({ x: GUTTER.touch, y: STRIP, w: 1180 - 2 * GUTTER.touch, h: air.tray!.y - STRIP })
    const old = hudFrame(1024, 768, true, NO_INSETS)
    expect([old.button, old.tray!.h, old.gap]).toEqual([64, 80, 10])
    expect(old.tray!.y + old.tray!.h).toBe(768 - TRAY_LIFT)
    const upright = hudFrame(820, 1180, true, HOME)
    expect([upright.held, upright.button, upright.tray!.h]).toEqual(['upright', 60, 76])
    // A laptop's gutters are narrow: no back swipe there.
    expect(hudFrame(1280, 800, false, NO_INSETS).free.x).toBe(GUTTER.mouse)
    // Under the top inset the strip moves down with everything below it.
    const notch = hudFrame(1180, 820, true, { top: 24, right: 0, bottom: 20, left: 0 })
    expect(notch.strip!.y).toBe(24)
    expect(notch.free.y).toBe(24 + STRIP)
  })

  it("fits a full row of buttons in every tray, closing the gaps before a button shrinks", () => {
    for (const [w, h, safe] of [...SCREENS.map((sc) => [sc.w, sc.h, sc.safe] as const), [768, 1024, NO_INSETS] as const, [1366, 1024, HOME] as const, [744, 1133, HOME] as const]) {
      const f = hudFrame(w, h, true, safe)
      if (f.held === 'phone') {
        // Three columns of four inside the tray's band, which stays TRAY_LIFT over the bottom inset, and the column's five.
        const { backing } = trayBoxes(f, 11)
        expect(backing.y + backing.h, `${w}x${h}`).toBeLessThanOrEqual(f.tray!.y + f.tray!.h)
        expect(backing.x + backing.w, `${w}x${h}`).toBeLessThanOrEqual(f.tray!.x + f.tray!.w)
        expect(5 * f.button + 4 * f.gap, `${w}x${h}`).toBeLessThanOrEqual(f.column!.h)
        continue
      }
      const n = f.held === 'upright' ? 11 : 13
      expect(n * f.button + (n - 1) * f.gap, `${w}x${h}`).toBeLessThanOrEqual(f.tray!.w - 2 * TRAY_PAD)
      expect(f.gap, `${w}x${h}`).toBeGreaterThanOrEqual(4)
    }
    // The old iPad upright keeps its 60 px buttons on 5 px gaps.
    const old = hudFrame(768, 1024, true, NO_INSETS)
    expect([old.button, old.gap]).toEqual([60, 5])
  })

  it('lays a phone on its side out in a left column and a three-column tray of 56 px buttons inside the safe areas, and asks to turn an upright phone', () => {
    const safe = { top: 0, right: 47, bottom: 21, left: 47 }
    const p = hudFrame(844, 390, true, safe)
    expect(p.held).toBe('phone')
    expect(p.strip).toBeNull()
    expect(p.column!.x).toBe(47)
    expect(p.tray!.x + p.tray!.w).toBe(844 - 47)
    expect(p.tray!.y + p.tray!.h).toBe(390 - 21 - TRAY_LIFT)
    expect(p.free.x).toBe(p.column!.x + p.column!.w)
    expect(p.free.x + p.free.w).toBe(p.tray!.x)
    expect(p.button).toBe(56)
    expect(fitCell(p, 3)).toBe(25)
    const small = hudFrame(750, 320, true, NO_INSETS)
    expect(small.button).toBe(56)
    // With the home indicator's inset the column's five buttons shrink to fit.
    const short = hudFrame(750, 320, true, { ...NO_INSETS, bottom: 21 })
    expect(5 * short.button + 4 * short.gap).toBeLessThanOrEqual(short.column!.h)
    expect(short.button).toBe(52)
    const turnMe = hudFrame(390, 844, true, safe)
    expect([turnMe.held, turnMe.strip, turnMe.column, turnMe.tray]).toEqual(['turnMe', null, null, null])
  })
})

describe('the tray, the HUD buttons and the reach', () => {
  it("lays the tray's buttons out in one centred row, or on a phone in three columns, inside the backing paper and the band", () => {
    const f = hudFrame(1180, 820, true, HOME)
    const { backing, buttons } = trayBoxes(f, 5)
    expect(backing.x - f.tray!.x).toBeCloseTo(f.tray!.x + f.tray!.w - (backing.x + backing.w), 9)
    expect(buttons.map((b) => b.x - buttons[0]!.x)).toEqual([0, 82, 164, 246, 328])
    expect(buttons.every((b) => b.y === f.tray!.y + TRAY_PAD && b.w === 72 && b.h === 72)).toBe(true)
    const p = hudFrame(750, 320, true, NO_INSETS)
    const phone = trayBoxes(p, 11).buttons
    expect(phone.slice(0, 4).map((b) => [b.x - p.tray!.x, b.y - p.tray!.y])).toEqual([
      [4, 4],
      [64, 4],
      [124, 4],
      [4, 64],
    ])
    expect(phone.every((b) => b.w === 56)).toBe(true)
  })

  it("presses every tray button the plan's finger taps, its scatter, its one tap in ten well off and its slide of up to 4 mm all in, at every screen", () => {
    const next = rng(11)
    for (const sc of CHILD_SCREENS) {
      const f = hudFrame(sc.w, sc.h, true, sc.safe)
      if (f.tray === null) continue
      let pressed = 0
      let n = 0
      for (const b of trayBoxes(f, f.held === 'sideways' ? 13 : 11).buttons)
        for (let i = 0; i < 100; i++) {
          const [dx, dy] = landing(next, FINGER, sc.mm)
          const [sx, sy] = off(next, next() * FINGER.slide * sc.mm)
          const x = b.x + b.w / 2 + dx
          const y = b.y + b.h / 2 + dy
          // A press that goes down off the button is another one's, or the tray's.
          if (x < b.x || x >= b.x + b.w || y < b.y || y >= b.y + b.h) continue
          n++
          if (onButton(b, x + sx, y + sy)) pressed++
        }
      expect(pressed / n, sc.name).toBeGreaterThan(0.99)
    }
  })

  it('takes a press on a HUD button that lifts within SLOP of it, and none further off', () => {
    const b = { x: 100, y: 700, w: 72, h: 72 }
    expect([onButton(b, 136, 736), onButton(b, 100 - SLOP, 700 - SLOP), onButton(b, 172 + SLOP, 772 + SLOP)]).toEqual([true, true, true])
    expect([onButton(b, 100 - SLOP - 1, 736), onButton(b, 136, 772 + SLOP + 1)]).toEqual([false, false])
  })

  it('reaches 72 px round a muncher where cells are big, at most 1.5 cells where they are small, and never less than SLOP round its body', () => {
    const at = (cell: number) => muncherReach({ ...game().v, cell })
    expect([at(52), at(49), at(43)]).toEqual([72, 72, 64.5])
    expect(at(25)).toBeCloseTo(37.5, 9)
    expect(at(16)).toBeCloseTo(SLOP + 0.36 * 16, 9)
  })

  it('holds a sticker by its bottom edge: its footprint\'s middle n / 2 + GRIP cells above the fingertip, turned or not, and fingerFor is its inverse', () => {
    for (const [w, h] of [
      [1180, 820],
      [820, 1180],
    ] as const) {
      const v = game(w, h).v
      for (const n of [1, 2]) {
        const [x, y] = heldAt(v, 400, 500, n)
        const [sx, sy] = toScreen(v, x, y)
        expect([sx, sy]).toEqual([expect.closeTo(400, 9), expect.closeTo(500 - (n / 2 + GRIP) * v.cell, 9)])
        expect(fingerFor(v, x, y, n)).toEqual([expect.closeTo(400, 9), expect.closeTo(500, 9)])
      }
    }
  })
})

describe('the map', () => {
  it('goes from the board to the screen and back, turned or not and while turning', () => {
    const hud = hudFrame(1180, 820, true, HOME)
    for (const turn of [0, 1, 0.37]) {
      const v: View = { w: 1180, h: 820, dpr: 2, cell: 52, upright: turn > 0.5, turn, ox: 140.5, oy: 700, hud }
      for (let i = 0; i < 40; i++) {
        const x = -2 + (i * 7.31) % 24
        const y = -1 + (i * 3.17) % 14
        const [sx, sy] = toScreen(v, x, y)
        const [bx, by] = toBoard(v, sx, sy)
        expect(bx, `turn ${turn}`).toBeCloseTo(x, 9)
        expect(by, `turn ${turn}`).toBeCloseTo(y, 9)
      }
      // A cell is a cell's width on the screen whichever way the board points.
      const [ax, ay] = toScreen(v, 3, 4)
      const [bx, by] = toScreen(v, 4, 4)
      expect(Math.hypot(bx - ax, by - ay)).toBeCloseTo(52, 9)
    }
  })

  it("turns the board upright with the munchers' east front at the top and the pad at the bottom by the tray", () => {
    const s = blankState(1)
    s.land = 3
    s.landFrom = 3
    const v = viewAt(s, 0, 820, 1180, 2, true, HOME)
    expect([v.upright, v.turn, v.cell]).toEqual([true, 1, 50])
    // East is up the screen and south to the right, a cell at a time, on whole pixels.
    const [ax, ay] = toScreen(v, 10, 6)
    expect(toScreen(v, 11, 6)).toEqual([ax, ay - 50])
    expect(toScreen(v, 10, 7)).toEqual([ax + 50, ay])
    expect([Number.isInteger(ax), Number.isInteger(ay)]).toEqual([true, true])
    // The board fills the free area's height: the east edge at its top, the pad's west edge at its bottom over the tray.
    const board = screenBox(v, landBox(3))
    expect(board.y).toBeGreaterThanOrEqual(v.hud.free.y)
    expect(board.y + board.h).toBeLessThanOrEqual(v.hud.tray!.y)
    expect(board.h).toBe(20 * 50)
    const pad = screenBox(v, { x: 1, y: 4, w: 3, h: 3 })
    expect(pad.y + pad.h).toBeGreaterThan(board.y + board.h - 5 * 50)
    // North (the top row) is at the left.
    expect(screenBox(v, { x: 0, y: 0, w: 20, h: 1 }).x).toBe(board.x)
  })

  it("puts a spot of an upright picture round its footprint's middle, and a burrow picture's door at the middle of its bottom edge, sideways and upright", () => {
    const s = blankState(1)
    s.land = 3
    s.landFrom = 3
    for (const [w, h] of [
      [1180, 820],
      [820, 1180],
    ] as const) {
      const v = viewAt(s, 0, w, h, 2, true, HOME)
      // The picture's top-left is the footprint's screen box's top-left, whichever way the board is turned.
      const box = screenBox(v, { x: 6, y: 6, w: 2, h: 2 })
      expect(pictureSpot(v, 6, 6, 2, 0, 0)).toEqual([box.x, box.y])
      expect(pictureSpot(v, 6, 6, 2, 1, 2)).toEqual([box.x + v.cell, box.y + 2 * v.cell])
      BURROWS.forEach((b, i) => {
        const door = pictureDoor(i, v.turn)
        const mound = screenBox(v, { x: b.x, y: b.y, w: 2, h: 2 })
        const [x, y] = toScreen(v, door.x, door.y)
        expect([x, y], `burrow ${i} at ${w}x${h}`).toEqual([mound.x + mound.w / 2, mound.y + mound.h])
      })
    }
    // Sideways the picture's door is board.ts's door; upright it is the middle of the mound's west edge.
    BURROWS.forEach((b, i) => {
      expect(pictureDoor(i, 0)).toEqual(b.door)
      expect(pictureDoor(i, 1)).toEqual({ x: b.x, y: b.y + 1 })
    })
  })

  it("bends a muncher's hop by its door to the door of its burrow's picture, waits in that doorway, and draws it where the sim has it everywhere else", () => {
    const door = BURROWS[1]!.door
    const m: Muncher = { id: 1, burrow: 1, mode: 'peek', modeAt: 0, cell: cellOf(door.x, door.y), toward: cellOf(door.x, door.y), stepAt: 0, stepFor: 50, hop: { x0: door.x, y0: door.y, x1: door.x, y1: door.y, at: 0, until: 0 }, homeWhy: null, target: null, tried: [], cheeks: [], grabAt: -1, idleSince: -1, outAt: -1, scout: false, shotBy: -1 }
    const pic = pictureDoor(1, 1)
    // Waiting in the doorway: at the picture's door upright, at board.ts's sideways.
    expect(muncherDrawn(m, 1, 1)).toEqual({ ...pic, lift: muncherPoint(m, 1).lift })
    expect(muncherDrawn(m, 1, 0)).toEqual(muncherPoint(m, 1))
    // A long hop out of the door starts at the picture's door, leaves the bend behind it after 1.5 cells, and ends where the sim ends it.
    m.mode = 'out'
    m.hop = { x0: door.x, y0: door.y, x1: door.x + 6, y1: door.y, at: 0, until: 360 }
    const at = (u: number) => muncherDrawn(m, u * 6, 1)
    expect(at(0)).toEqual({ ...pic, lift: muncherPoint(m, 0).lift })
    for (const u of [0.3, 0.6, 1]) {
      expect(at(u).x, `out ${u}`).toBeCloseTo(muncherPoint(m, u * 6).x, 9)
      expect(at(u).y, `out ${u}`).toBeCloseTo(muncherPoint(m, u * 6).y, 9)
    }
    // Home again: the hop ends in the picture's doorway.
    m.mode = 'home'
    m.hop = { x0: door.x + 6, y0: door.y, x1: door.x, y1: door.y, at: 0, until: 360 }
    expect(muncherDrawn(m, 6, 1).x).toBeCloseTo(pic.x, 9)
    expect(muncherDrawn(m, 6, 1).y).toBeCloseTo(pic.y, 9)
    expect(muncherDrawn(m, 1.2, 1).x).toBeCloseTo(muncherPoint(m, 1.2).x, 9)
    // A walker never bends.
    m.mode = 'walk'
    m.hop = null
    expect(muncherDrawn(m, 3, 1)).toEqual(muncherPoint(m, 3))
  })
})

// ---------------------------------------------------------------------------------------
// The hit order

/** A blank game with land 3 open at tick 6000 (no stamp fresh), on a sideways Air in full screen: 52 px cells. */
function game(w = 1180, h = 820): { s: State; v: View; t: number; at: (x: number, y: number) => Hit } {
  const s = blankState(1)
  s.land = 3
  s.landFrom = 3
  s.tick = 6000
  const t = s.tick * STEP
  const v = viewAt(s, t, w, h, 2, true, HOME)
  return { s, v, t, at: (x, y) => hitTest(s, v, ...toScreen(v, x, y), t) }
}
/** A straight belt over the cells, every one pointing `dir`. */
function belt(s: State, cells: readonly (readonly [number, number])[], dir: Dir) {
  for (const [x, y] of cells) {
    const c = cellOf(x, y)
    s.belts.out[c] = dir
    s.belts.in[c] = (dir + 2) % 4
  }
}
/** A thing in a belt cell's in slot (a quarter of the way along it) or its out slot. */
function thing(s: State, x: number, y: number, slot: 'in' | 'out', what: Thing = 'blueBar') {
  s.belts.slot[slot === 'in' ? inSlot(cellOf(x, y)) : outSlot(cellOf(x, y))] = thingIndex(what)
}
function build(s: State, kind: Kind, x: number, y: number) {
  const b = newBuilding(s.nextId++, kind, x, y, -1)
  s.buildings.push(b)
  s.owner = owners(s)
  return b
}
function muncher(s: State, id: number, x: number, y: number, mode: MuncherMode): Muncher {
  const m: Muncher = { id, burrow: 0, mode, modeAt: 0, cell: cellOf(x, y), toward: cellOf(x, y), stepAt: 0, stepFor: 50, hop: null, homeWhy: null, target: null, tried: [], cheeks: [], grabAt: -1, idleSince: -1, outAt: 0, scout: false, shotBy: -1 }
  s.munchers.push(m)
  return m
}

describe('what a touch lands on', () => {
  it('tickles a muncher sitting on a belt in front of a machine from the machine and the things behind it, and leaves the far side of the machine to the machine', () => {
    const { s, v, at } = game()
    // A belt along row 6 into the start oven's east edge, a muncher sitting on its last cell, things queued behind it.
    belt(s, [[8, 6], [9, 6], [10, 6], [11, 6]], 2)
    thing(s, 9, 6, 'in')
    thing(s, 10, 6, 'in')
    thing(s, 11, 6, 'in')
    muncher(s, 5, 8, 6, 'sit')
    const tickle: Hit = { kind: 'muncher', id: 5 }
    expect(at(8.5, 6.2)).toEqual(tickle)
    expect(at(7.6, 6.4)).toEqual(tickle)
    expect(at(9.5, 6.5)).toEqual(tickle)
    expect(at(9.75, 6.5)).toEqual(tickle)
    expect(at(6.3, 7.7)).toEqual({ kind: 'building', id: 1 })
    expect(at(10.75, 6.5)).toEqual({ kind: 'thing', slot: inSlot(cellOf(10, 6)) })
    expect(at(11.75, 6.5)).toEqual({ kind: 'thing', slot: inSlot(cellOf(11, 6)) })
    // The reach is MUNCHER_REACH px round its body, on the screen.
    const [mx, my] = toScreen(v, 8.5, 6.5 - 0.38)
    expect(hitTest(s, v, mx, my + MUNCHER_REACH - 1, s.tick * STEP)).toEqual(tickle)
    expect(hitTest(s, v, mx, my + MUNCHER_REACH + 1, s.tick * STEP)).not.toEqual(tickle)
  })

  it('tickles a muncher where it was a quarter of a second ago, and anywhere on the machine it naps on', () => {
    const { s, at } = game()
    // Hopping home along row 10 at 8 cells a second, halfway there now.
    const m = muncher(s, 7, 3, 10, 'home')
    m.hop = { x0: 3.5, y0: 10.5, x1: 11.5, y1: 10.5, at: s.tick - 30, until: s.tick + 30 }
    expect(at(7.5, 10.1)).toEqual({ kind: 'muncher', id: 7 })
    expect(at(5.5, 10.1)).toEqual({ kind: 'muncher', id: 7 })
    expect(at(3.6, 10.1)).toEqual({ kind: 'ground', cell: cellOf(3, 10) })
    // Napping on a green bottle maker: every corner of its footprint.
    const maker = build(s, 'greenMaker', 2, 7)
    maker.napper = 8
    muncher(s, 8, 2, 7, 'nap')
    for (const [x, y] of [[2.05, 7.05], [3.95, 7.05], [2.05, 8.95], [3.95, 8.95]] as const) expect(at(x, y), `${x}, ${y}`).toEqual({ kind: 'muncher', id: 8 })
    // Watching the launch by the pad, a muncher takes no taps.
    muncher(s, 9, 9, 11, 'watch')
    expect(at(9.5, 11.2)).toEqual({ kind: 'ground', cell: cellOf(9, 11) })
  })

  it("puts the hint's sticker ghost over the patch it stands on, shown late for a kind she has placed often", () => {
    const { s, t, at } = game()
    expect(at(7.5, 2.5)).toEqual({ kind: 'patch', cell: cellOf(7, 2) })
    s.hint = { step: { kind: 'place', sticker: 'digger', x: 7, y: 2 }, at: s.tick }
    expect(hintGhost(s, t)).toEqual({ sticker: 'digger', x: 7, y: 2 })
    for (const [x, y] of [[7.5, 2.5], [8.9, 3.9]] as const) expect(at(x, y)).toEqual({ kind: 'spot' })
    expect(at(9.5, 2.5)).toEqual({ kind: 'patch', cell: cellOf(9, 2) })
    s.help.placed.digger = HELP_FULL
    expect(at(7.5, 2.5)).toEqual({ kind: 'patch', cell: cellOf(7, 2) })
    s.hint.at = s.tick - GHOST_DELAY
    expect(at(7.5, 2.5)).toEqual({ kind: 'spot' })
    // One more of the slowest machine, and a tower or a bowl of the defence, are ghosts too; a hedge line is not.
    s.hint = { step: { kind: 'bottleneck', id: 1, sticker: 'oven', x: 4, y: 9 }, at: s.tick }
    expect(at(4.5, 9.5)).toEqual({ kind: 'spot' })
    // A tower or a bowl only once the belt under its cell exists: before that its dotted belt is the step, and a tap on its spot is the ground's, never a ghost that could only fly back.
    s.hint = { step: { kind: 'defend', sticker: 'tower', cells: [cellOf(3, 11), cellOf(4, 11), cellOf(5, 11)], x: 5, y: 11 }, at: s.tick }
    expect(hintGhost(s, t)).toBeNull()
    expect(at(5.5, 11.5)).toEqual({ kind: 'ground', cell: cellOf(5, 11) })
    belt(s, [[3, 11], [4, 11], [5, 11]], 0)
    expect(at(5.5, 11.5)).toEqual({ kind: 'spot' })
    s.hint = { step: { kind: 'defend', sticker: 'bowl', cells: [], x: 5, y: 11 }, at: s.tick }
    expect(hintGhost(s, t)).toEqual({ sticker: 'bowl', x: 5, y: 11 })
    expect(at(5.5, 11.5)).toEqual({ kind: 'spot' })
    s.belts.out.fill(-1)
    s.belts.in.fill(-1)
    s.hint = { step: { kind: 'defend', sticker: 'hedge', cells: [cellOf(5, 11)], x: 5, y: 11 }, at: s.tick }
    expect(at(5.5, 11.5)).toEqual({ kind: 'ground', cell: cellOf(5, 11) })
  })

  it('puts a heap over its mound, the basket over the ground, and Beep under the basket and only while idle', () => {
    const { s, at } = game()
    const heap = heapPoint(0)
    expect(at(heap.x, heap.y - 0.2)).toEqual({ kind: 'burrow', burrow: 0 })
    s.burrows[0]!.heap[thingIndex('greenBottle')] = 2
    expect(at(heap.x, heap.y - 0.2)).toEqual({ kind: 'heap', burrow: 0 })
    expect(at(BURROWS[0]!.x + 1.6, BURROWS[0]!.y + 0.4)).toEqual({ kind: 'burrow', burrow: 0 })
    expect(at(0.5, 5.6)).toEqual({ kind: 'basket' })
    // Beep floats over the basket: its body answers above the basket's reach.
    expect(at(0.5, 4.75)).toEqual({ kind: 'beep' })
    s.beep.pose = 'dig'
    expect(at(0.5, 4.75)).toEqual({ kind: 'ground', cell: cellOf(0, 4) })
    s.beep.pose = 'float'
    s.beep.movedAt = s.tick
    expect(at(0.5, 4.75)).toEqual({ kind: 'ground', cell: cellOf(0, 4) })
  })

  it('puts Moony over the pad once the first rocket has flown, then towers over the belt under them, stacks over their machine, the machine over the things at its mouth', () => {
    const { s, at } = game()
    expect(at(moonyPoint.x, moonyPoint.y - 0.3)).toEqual({ kind: 'building', id: 0 })
    s.launches = 1
    expect(at(moonyPoint.x, moonyPoint.y - 0.3)).toEqual({ kind: 'moony' })
    expect(at(2.5, 5)).toEqual({ kind: 'building', id: 0 })
    belt(s, [[3, 11], [4, 11], [5, 11], [6, 11]], 0)
    thing(s, 5, 11, 'in')
    thing(s, 5, 11, 'out')
    const tower = build(s, 'tower', 5, 11)
    expect(at(5.5, 11.5)).toEqual({ kind: 'building', id: tower.id })
    expect(at(5.25, 11.5)).toEqual({ kind: 'building', id: tower.id })
    // The oven's roof stack, standing half over its top edge, wins over the oven and the cell above it.
    const oven = s.buildings[1]!
    expect(at(7.1, 5.8)).toEqual({ kind: 'ground', cell: cellOf(7, 5) })
    oven.stack.push('blueBar')
    expect(at(7.1, 5.8)).toEqual({ kind: 'stack', id: 1 })
    expect(at(7.1, 6.2)).toEqual({ kind: 'stack', id: 1 })
    expect(at(7.1, 7.5)).toEqual({ kind: 'building', id: 1 })
    // A thing at the oven's east mouth: on the oven the oven, off it the thing.
    belt(s, [[8, 7], [9, 7]], 2)
    thing(s, 8, 7, 'out')
    expect(at(7.9, 7.5)).toEqual({ kind: 'building', id: 1 })
    expect(at(8.2, 7.5)).toEqual({ kind: 'thing', slot: outSlot(cellOf(8, 7)) })
  })

  it('puts things over their belt, an empty belt over the patch it runs on, then patches and the pond, hedges, flowers, trees and bare ground', () => {
    const { s, at } = game()
    belt(s, [[2, 10], [3, 10], [4, 10], [5, 10], [6, 10]], 0)
    thing(s, 2, 10, 'in')
    thing(s, 3, 10, 'out')
    expect(at(2.25, 10.5)).toEqual({ kind: 'thing', slot: inSlot(cellOf(2, 10)) })
    expect(at(3.8, 10.5)).toEqual({ kind: 'thing', slot: outSlot(cellOf(3, 10)) })
    // Among things in reach, the nearer.
    expect(at(2.45, 10.5)).toEqual({ kind: 'thing', slot: inSlot(cellOf(2, 10)) })
    expect(at(3.5, 10.5)).toEqual({ kind: 'thing', slot: outSlot(cellOf(3, 10)) })
    expect(at(5.5, 10.5)).toEqual({ kind: 'belt', cell: cellOf(5, 10) })
    belt(s, [[16, 11]], 2)
    expect(at(16.5, 11.5)).toEqual({ kind: 'belt', cell: cellOf(16, 11) })
    expect(at(17.5, 11.5)).toEqual({ kind: 'patch', cell: cellOf(17, 11) })
    expect(at(0.5, 8.5)).toEqual({ kind: 'pond', cell: cellOf(0, 8) })
    s.hedge[cellOf(8, 9)] = 1
    s.hedge[cellOf(9, 9)] = 2
    expect(at(8.5, 9.5)).toEqual({ kind: 'hedge', cell: cellOf(8, 9) })
    expect(at(9.5, 9.5)).toEqual({ kind: 'hedge', cell: cellOf(9, 9) })
    // A hedge on rocks: the rocks are not bare.
    s.hedge[cellOf(18, 11)] = 1
    expect(at(18.5, 11.5)).toEqual({ kind: 'hedge', cell: cellOf(18, 11) })
    expect(at(10.5, 1.5)).toEqual({ kind: 'flowers', cell: cellOf(10, 1) })
    // Rocks on a burrow's flowers are a patch.
    expect(at(10.5, 2.5)).toEqual({ kind: 'patch', cell: cellOf(10, 2) })
    expect(at(9.5, 0.5)).toEqual({ kind: 'tree', cell: cellOf(9, 0) })
    expect(at(11.5, 10.5)).toEqual({ kind: 'ground', cell: cellOf(11, 10) })
  })

  it('answers the table in the gutters, round the land and west of it, and the flaps east, north and south of it whenever there is a next land', () => {
    const { s, v, t, at } = game()
    expect(hitTest(s, v, 10, 400, t)).toEqual({ kind: 'table' })
    expect(hitTest(s, v, 1170, 400, t)).toEqual({ kind: 'table' })
    // Land 3 fills 1040 of the free area's 1140 px: the table shows either side, and the edge cells are the land's.
    expect(hitTest(s, v, v.hud.free.x + 20, 400, t)).toEqual({ kind: 'table' })
    expect(at(19.9, 7.5)).toEqual({ kind: 'flowers', cell: cellOf(19, 7) })
    expect(at(0.1, 10.5)).toEqual({ kind: 'ground', cell: cellOf(0, 10) })
    // Land 3 has no next land: no flaps round it.
    expect(at(10.5, -0.05)).toEqual({ kind: 'table' })
    expect(hitTest(s, v, v.hud.free.x + v.hud.free.w - 20, 400, t)).toEqual({ kind: 'table' })
    // Land 1, with the flaps of land 2 east, north and south of it: a tap there lifts their corner before the Land! card and opens them after it.
    s.land = 1
    s.landFrom = 1
    for (const flap of [0, 2] as const) {
      s.flap = flap
      const one = viewAt(s, t, 1180, 820, 2, true, HOME)
      const at1 = (x: number, y: number) => hitTest(s, one, ...toScreen(one, x, y), t)
      expect(at1(12.5, 5.5)).toEqual({ kind: 'ground', cell: cellOf(12, 5) })
      expect(at1(13.2, 5.5)).toEqual({ kind: 'flap' })
      expect(at1(6, 1.8)).toEqual({ kind: 'flap' })
      expect(at1(6, 10.2)).toEqual({ kind: 'flap' })
      expect(at1(-0.3, 5.5)).toEqual({ kind: 'table' })
      // Closed land's rocks and burrows answer nothing but the flaps over them.
      expect(at1(14.5, 8.5)).toEqual({ kind: 'flap' })
    }
    // Land 2's flaps are land 3's.
    s.land = 2
    s.landFrom = 2
    s.flap = 0
    const two = viewAt(s, t, 1180, 820, 2, true, HOME)
    expect(hitTest(s, two, ...toScreen(two, 16.2, 5.5), t)).toEqual({ kind: 'flap' })
    expect(hitTest(s, two, ...toScreen(two, 8, 0.8), t)).toEqual({ kind: 'flap' })
  })

  it('grows every small target to a fingertip on the phone: 28 px round a point, 56 px across a cell', () => {
    const s = blankState(1)
    s.land = 3
    s.landFrom = 3
    s.tick = 6000
    const t = s.tick * STEP
    const v = viewAt(s, t, 750, 320, 2, true, NO_INSETS)
    expect(v.cell).toBe(25)
    s.burrows[1]!.heap[thingIndex('gear')] = 1
    const [hx, hy] = toScreen(v, heapPoint(1).x, heapPoint(1).y - 0.2)
    expect(hitTest(s, v, hx - SLOP + 1, hy, t)).toEqual({ kind: 'heap', burrow: 1 })
    expect(hitTest(s, v, hx - SLOP - 2, hy, t)).not.toEqual({ kind: 'heap', burrow: 1 })
    const tower = build(s, 'tower', 9, 10)
    const [tx, ty] = toScreen(v, 9, 10.5)
    expect(hitTest(s, v, tx - 14, ty, t)).toEqual({ kind: 'building', id: tower.id })
    expect(hitTest(s, v, tx - 16, ty, t)).toEqual({ kind: 'ground', cell: cellOf(8, 10) })
  })

  it('lands on the same things turned upright, with the pictures standing up the screen', () => {
    const sideways = game()
    const upright = game(820, 1180)
    for (const g of [sideways, upright]) {
      belt(g.s, [[8, 6], [9, 6], [10, 6]], 2)
      thing(g.s, 10, 6, 'in')
      build(g.s, 'tower', 5, 11)
      g.s.buildings[1]!.stack.push('gear')
      g.s.hedge[cellOf(8, 9)] = 1
    }
    expect(upright.v.turn).toBe(1)
    for (const [x, y] of [[9.5, 6.5], [10.75, 6.5], [5.5, 11.5], [6.5, 7.5], [2.5, 5.5], [17.5, 11.5], [0.5, 8.5], [8.5, 9.5], [10.5, 1.5], [9.5, 0.5], [11.5, 10.5], [12.5, 2.5]] as const) {
      expect(upright.at(x, y), `${x}, ${y}`).toEqual(sideways.at(x, y))
    }
    // A muncher's body stands up the screen from its feet: upright, up the screen is east.
    muncher(upright.s, 3, 9, 9, 'walk')
    const [fx, fy] = toScreen(upright.v, 9.5, 9.5)
    expect(hitTest(upright.s, upright.v, fx, fy - 0.38 * upright.v.cell - MUNCHER_REACH + 2, upright.t)).toEqual({ kind: 'muncher', id: 3 })
    // One waiting in its doorway answers where its burrow's picture shows the door: upright, at the bottom of the mound, not its side.
    const door = BURROWS[1]!.door
    const peek = muncher(upright.s, 4, door.x, door.y, 'peek')
    peek.burrow = 1
    peek.hop = { x0: door.x, y0: door.y, x1: door.x, y1: door.y, at: 0, until: 0 }
    const ring = targets(upright.s, upright.v, upright.t).find((x) => x.hit.kind === 'muncher' && x.hit.id === 4)!.area
    const [dx, dy] = toScreen(upright.v, pictureDoor(1, 1).x, pictureDoor(1, 1).y)
    expect(ring).toEqual({ kind: 'disc', x: dx, y: dy - 0.38 * upright.v.cell, r: MUNCHER_REACH })
    // The oven's roof stack is along the top of its picture on the screen, which is its east side on the board.
    const oven = screenBox(upright.v, { x: 6, y: 6, w: 2, h: 2 })
    expect(hitTest(upright.s, upright.v, oven.x + oven.w / 2, oven.y + 2, upright.t)).toEqual({ kind: 'stack', id: 1 })
    expect(toBoard(upright.v, oven.x + oven.w / 2, oven.y + 2)[0]).toBeGreaterThan(7.9)
  })

  it('lists every target for ?debug, each in its place in the order', () => {
    const { s, t, v } = game()
    belt(s, [[3, 10]], 0)
    thing(s, 3, 10, 'in')
    muncher(s, 4, 9, 9, 'walk')
    s.launches = 1
    s.burrows[0]!.heap[0] = 1
    s.hedge[cellOf(8, 9)] = 1
    s.hint = { step: { kind: 'place', sticker: 'digger', x: 7, y: 2 }, at: s.tick - ticks(20) }
    s.buildings[1]!.stack.push('blueBar')
    const all = targets(s, v, t)
    const kinds = new Set(all.map((x) => x.hit.kind))
    for (const k of ['muncher', 'spot', 'heap', 'basket', 'moony', 'stack', 'building', 'burrow', 'thing', 'belt', 'patch', 'pond', 'beep', 'hedge', 'flowers', 'tree', 'ground'] as const) expect(kinds.has(k), k).toBe(true)
    for (const x of all) expect(x.rank, x.hit.kind).toBe(RANK[x.hit.kind === 'basket' ? 'heap' : x.hit.kind === 'pond' ? 'patch' : x.hit.kind === 'burrow' ? 'building' : x.hit.kind === 'building' && ['tower', 'bowl'].includes(s.buildings.find((b) => b.id === (x.hit as { id: number }).id)!.kind) ? 'tower' : (x.hit.kind as keyof typeof RANK)])
  })
})
