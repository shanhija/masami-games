/**
 * The view as a pure function of the state and the time (plans/rocket-factory.md, The board
 * and the view): every screen settles on whole px cells with the land in the middle of what
 * the HUD leaves free, the land eases out over GROW when its flaps fold open, and the table
 * turns over TURN when the window goes upright or back, holding the board's input meanwhile.
 */
import { describe, expect, it } from 'vitest'

import { TURN, inputHeld, viewAt } from './camera'
import { GROW } from './catalog'
import { NO_INSETS, fitCell, hudFrame, landBox, screenBox, toScreen, type Insets, type View } from './layout'
import { STEP, type Land, type State } from './model'
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

function at(land: Land): State {
  const s = blankState(1)
  s.land = land
  s.landFrom = land
  s.tick = 6000
  return s
}
/** Whether screen box `b` lies inside `free`, to half a pixel. */
const within = (b: Box, free: Box) => b.x >= free.x - 0.5 && b.y >= free.y - 0.5 && b.x + b.w <= free.x + free.w + 0.5 && b.y + b.h <= free.y + free.h + 0.5

describe('the view', () => {
  it('settles every screen and land on whole px cells and a whole px origin, the land and its flaps in the middle of the free area', () => {
    for (const [w, h, safe] of SCREENS)
      for (const land of [1, 2, 3] as const) {
        const s = at(land)
        const v = viewAt(s, s.tick * STEP, w, h, 2, true, safe)
        const name = `${w}x${h} land ${land}`
        expect(v.cell, name).toBe(fitCell(hudFrame(w, h, true, safe), land))
        expect([Number.isInteger(v.ox), Number.isInteger(v.oy)], name).toEqual([true, true])
        const b = screenBox(v, landBox(land))
        expect(within(b, v.hud.free), name).toBe(true)
        expect(Math.abs(b.x + b.w / 2 - (v.hud.free.x + v.hud.free.w / 2)), name).toBeLessThanOrEqual(0.5)
        expect(Math.abs(b.y + b.h / 2 - (v.hud.free.y + v.hud.free.h / 2)), name).toBeLessThanOrEqual(0.5)
        expect(inputHeld(s, s.tick * STEP), name).toBe(false)
      }
  })

  it("eases the land out over GROW when the next land's flaps fold open, from the old land's view to the new one's, with no board input meanwhile", () => {
    for (const [w, h, safe] of SCREENS) {
      const s = at(2)
      s.landFrom = 1
      s.landAt = s.tick
      const start = s.tick * STEP
      const was = viewAt(at(1), start, w, h, 2, true, safe)
      const views: View[] = []
      for (let k = 0; k <= GROW; k++) views.push(viewAt(s, start + k * STEP, w, h, 2, true, safe))
      const name = `${w}x${h}`
      expect(Math.abs(views[0]!.cell - was.cell), name).toBeLessThan(1.5)
      for (let k = 1; k < views.length; k++) expect(views[k]!.cell, `${name} frame ${k}`).toBeLessThanOrEqual(views[k - 1]!.cell + 1e-9)
      expect(views.at(-1), name).toEqual(viewAt(at(2), start, w, h, 2, true, safe))
      // The board point under the free area's middle moves smoothly from one land's middle to the other's.
      const steps = views.slice(1).map((v, k) => Math.abs(v.cell - views[k]!.cell))
      expect(Math.max(...steps), name).toBeLessThan(0.5)
      expect(inputHeld(s, start), name).toBe(true)
      expect(inputHeld(s, start + (GROW - 1) * STEP), name).toBe(true)
      expect(inputHeld(s, start + GROW * STEP), name).toBe(false)
    }
  })

  it('turns the whole table over TURN when the window goes upright or back, the board inside the free area every frame, with no board input meanwhile', () => {
    for (const [w, h, safe] of [[820, 1180, HOME], [1180, 820, HOME], [768, 1024, NO_INSETS], [1024, 768, NO_INSETS]] as const) {
      const s = at(3)
      s.turnedAt = s.tick
      const start = s.tick * STEP
      const upright = h > w
      const frames = Math.round(TURN / STEP)
      const turns: number[] = []
      for (let k = 0; k <= frames; k++) {
        const v = viewAt(s, start + k * STEP, w, h, 2, true, safe)
        turns.push(v.turn)
        expect(v.upright, `${w}x${h}`).toBe(upright)
        expect(within(screenBox(v, landBox(3)), v.hud.free), `${w}x${h} frame ${k}`).toBe(true)
      }
      expect(turns[0], `${w}x${h}`).toBe(upright ? 0 : 1)
      expect(turns.at(-1), `${w}x${h}`).toBe(upright ? 1 : 0)
      for (let k = 1; k < turns.length; k++) expect(upright ? turns[k]! >= turns[k - 1]! : turns[k]! <= turns[k - 1]!, `${w}x${h} frame ${k}`).toBe(true)
      const settled = viewAt(at(3), start, w, h, 2, true, safe)
      expect(viewAt(s, start + TURN, w, h, 2, true, safe), `${w}x${h}`).toEqual(settled)
      // Halfway the board is turned halfway, a little smaller to fit its turned corners.
      const half = viewAt(s, start + TURN / 2, w, h, 2, true, safe)
      expect(half.turn, `${w}x${h}`).toBeCloseTo(0.5, 9)
      expect(half.cell, `${w}x${h}`).toBeLessThan(settled.cell)
      expect(inputHeld(s, start + TURN - STEP), `${w}x${h}`).toBe(true)
      expect(inputHeld(s, start + TURN), `${w}x${h}`).toBe(false)
    }
  })

  it('holds the board during the launch, from her tap until the flight lands', () => {
    const s = at(3)
    expect(inputHeld(s, s.tick * STEP)).toBe(false)
    s.launch = { at: s.tick, landsAt: s.tick + 2400 }
    expect(inputHeld(s, s.tick * STEP + 20)).toBe(true)
    s.launch = null
    expect(inputHeld(s, s.tick * STEP + 20)).toBe(false)
  })

  it("never turns a phone's board, and keeps a cell a cell wide while the table turns", () => {
    const s = at(3)
    s.turnedAt = s.tick
    const t = s.tick * STEP + TURN / 2
    for (const [w, h] of [[750, 320], [390, 844]] as const) {
      const v = viewAt(s, t, w, h, 2, true, NO_INSETS)
      expect([v.upright, v.turn], `${w}x${h}`).toEqual([false, 0])
    }
    // A turned board keeps a cell a cell's width whichever way it points, mid-turn too.
    const v = viewAt(s, t, 820, 1180, 2, true, HOME)
    const [ax, ay] = toScreen(v, 4, 4)
    const [bx, by] = toScreen(v, 5, 4)
    expect(Math.hypot(bx - ax, by - ay)).toBeCloseTo(v.cell, 9)
  })
})
