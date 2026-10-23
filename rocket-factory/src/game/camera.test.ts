/**
 * The view as a pure function of a camera and the window (plans/rocket-factory.md, The board
 * and the view): the start camera fits the start block, today's first board in the board's
 * north-west corner, on whole px cells in the middle of what the HUD leaves free; the view
 * through a camera puts the camera's board point at the middle of the free area on a whole px
 * origin; the board beyond the start block shows in the margins; and the board takes no input
 * during the launch.
 */
import { describe, expect, it } from 'vitest'

import { CORNER } from './board'
import { inputHeld, startCamera, startView, viewOf, type Camera } from './camera'
import { NO_INSETS, cellsIn, hudFrame, screenBox, toBoard, toScreen, type Insets } from './layout'
import { COLS, ROWS } from './model'
import { blankState } from './rules'
import type { Box } from './where'

const HOME: Insets = { ...NO_INSETS, bottom: 20 }
const SCREENS = [
  [1180, 820, HOME],
  [1024, 768, NO_INSETS],
  [820, 1180, HOME],
  [1024, 662, NO_INSETS],
  [1180, 710, HOME],
  [820, 1070, HOME],
  [750, 320, NO_INSETS],
  [1366, 1024, HOME],
  [1920, 1080, NO_INSETS],
] as const

/** Whether screen box `b` lies inside `free`, to half a pixel. */
const within = (b: Box, free: Box) => b.x >= free.x - 0.5 && b.y >= free.y - 0.5 && b.x + b.w <= free.x + free.w + 0.5 && b.y + b.h <= free.y + free.h + 0.5
const corner: Box = { x: CORNER.x, y: CORNER.y, w: CORNER.w, h: CORNER.h }

describe('the start camera', () => {
  it('fits the start block into the free area on whole px cells, its middle at the free area middle, on every screen', () => {
    for (const [w, h, safe] of SCREENS) {
      const hud = hudFrame(w, h, true, safe)
      const cam = startCamera(hud)
      const name = `${w}x${h}`
      expect(Number.isInteger(cam.cell), name).toBe(true)
      expect(cam.cell, name).toBe(Math.floor(Math.min(hud.free.w / CORNER.w, hud.free.h / CORNER.h)))
      expect([cam.x, cam.y], name).toEqual([CORNER.x + CORNER.w / 2, CORNER.y + CORNER.h / 2])
      const v = viewOf(cam, w, h, 2, true, safe)
      expect([Number.isInteger(v.ox), Number.isInteger(v.oy)], name).toEqual([true, true])
      const b = screenBox(v, corner)
      expect(within(b, v.hud.free), name).toBe(true)
      expect(Math.abs(b.x + b.w / 2 - (v.hud.free.x + v.hud.free.w / 2)), name).toBeLessThanOrEqual(0.5)
      expect(Math.abs(b.y + b.h / 2 - (v.hud.free.y + v.hud.free.h / 2)), name).toBeLessThanOrEqual(0.5)
    }
  })

  it('is the iPad Air sideways at 52 px cells, the build zoom, and startView is the view through it', () => {
    const cam = startCamera(hudFrame(1180, 820, true, HOME))
    expect(cam.cell).toBe(52)
    for (const [w, h, safe] of SCREENS) expect(startView(w, h, 2, true, safe), `${w}x${h}`).toEqual(viewOf(startCamera(hudFrame(w, h, true, safe)), w, h, 2, true, safe))
  })

  it('shows the board beyond the start block in the margins, east and south, and the table only past the board edge', () => {
    // Sideways the free area is wider than the block: the next column east shows, and west of the board is the table.
    const sideways = startView(1180, 820, 2, true, HOME)
    const seen = cellsIn(sideways, sideways.hud.free)
    expect(seen.x0).toBe(0)
    expect(seen.x1).toBeGreaterThan(CORNER.w)
    expect(toBoard(sideways, sideways.hud.free.x, 100)[0]).toBeLessThan(0)
    // Upright it is taller: rows south of the block show, and the block is never turned (a cell is a cell wide along x).
    const upright = startView(820, 1180, 2, true, HOME)
    expect(upright.hud.held).toBe('upright')
    const south = cellsIn(upright, upright.hud.free)
    expect(south.y1).toBeGreaterThan(CORNER.h)
    expect(south.x1).toBeLessThanOrEqual(CORNER.w + 1)
    const [ax, ay] = toScreen(upright, 4, 4)
    const [bx, by] = toScreen(upright, 5, 4)
    expect([bx - ax, by - ay]).toEqual([upright.cell, 0])
    // Never more than the board.
    expect(cellsIn(sideways, { x: -1000, y: -1000, w: 9000, h: 9000 })).toEqual({ x0: 0, y0: 0, x1: COLS, y1: ROWS })
  })
})

describe('the view through a camera', () => {
  it("puts the camera's board point at the middle of the free area, on a whole px origin, at the camera's own cell size", () => {
    for (const [w, h, safe] of SCREENS)
      for (const cam of [{ x: 33.3, y: 20.7, cell: 37 }, { x: 0, y: 0, cell: 80 }, { x: COLS, y: ROWS, cell: 19 }] as Camera[]) {
        const v = viewOf(cam, w, h, 2, true, safe)
        const name = `${w}x${h} at ${cam.x}, ${cam.y}`
        expect(v.cell, name).toBe(cam.cell)
        expect([Number.isInteger(v.ox), Number.isInteger(v.oy)], name).toEqual([true, true])
        const [sx, sy] = toScreen(v, cam.x, cam.y)
        expect(Math.abs(sx - (v.hud.free.x + v.hud.free.w / 2)), name).toBeLessThanOrEqual(0.5)
        expect(Math.abs(sy - (v.hud.free.y + v.hud.free.h / 2)), name).toBeLessThanOrEqual(0.5)
      }
  })

  it('maps a board point to the screen and back', () => {
    const v = viewOf({ x: 33.3, y: 20.7, cell: 37 }, 1180, 820, 2, true, HOME)
    const [sx, sy] = toScreen(v, 12.25, 30.5)
    const [bx, by] = toBoard(v, sx, sy)
    expect(bx).toBeCloseTo(12.25, 9)
    expect(by).toBeCloseTo(30.5, 9)
  })

  it('holds the board during the launch, from her tap until the flight lands', () => {
    const s = blankState(1)
    s.tick = 6000
    expect(inputHeld(s)).toBe(false)
    s.launch = { at: s.tick, landsAt: s.tick + 2400 }
    expect(inputHeld(s)).toBe(true)
    s.launch = null
    expect(inputHeld(s)).toBe(false)
  })
})
