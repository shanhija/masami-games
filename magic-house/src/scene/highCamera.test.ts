import { describe, expect, it } from 'vitest'

import { CAMERA_PITCH } from '../../../castle-builder/src/scene/look'
import { KID_HEIGHT } from '../../../silly-billy/src/engine/body'
import type { Vec3 } from '../../../silly-billy/src/engine/types'
import { ROOM } from '../engine/api'
import { HIGH_FRAME } from '../engine/camera'
import { LOOK_PLACE } from '../engine/look'
import { ROOM_BOUNDS, type FloorFrame, type World } from '../engine/world'
import { padBand } from '../seats/TouchPad'
import { hudTop } from '../shell/Hud'
import { HIGH_AXES, highToScreen, highView, highWindow, rayToGround, screenRay } from './highCamera'

const bounds: World['bounds'] = ROOM_BOUNDS.high
const floor: FloorFrame = HIGH_FRAME
const screen = { width: 1280, height: 800, clearBottom: 240, clearTop: 96 }

const corners = (b: World['bounds'], f: FloorFrame): Vec3[] =>
  [-1, 1].flatMap((sx) => [b.min[1], b.max[1]].flatMap((y) => [-1, 1].map((sz): Vec3 => [f.x + (sx * f.width) / 2, y, f.z + (sz * f.depth) / 2])))

describe('the camera from high up', () => {
  it('draws a kid 32 to 37 px tall on the tablet with its pads and 42 to 50 px at 1280 by 800, from the floor\'s front to its back (step 7a)', () => {
    const kid = (width: number, height: number, touch: boolean) => {
      const v = highView(bounds, floor, { width, height, clearBottom: touch ? padBand(height) : 0, clearTop: hudTop(width, height) }, [0, 0])
      return [ROOM.high.depth / 2, 0, -ROOM.high.depth / 2].map((z) => {
        const [a, b] = [highToScreen(v, [0, 0, z]), highToScreen(v, [0, KID_HEIGHT, z])]
        return Math.round(Math.hypot(a[0] - b[0], a[1] - b[1]))
      })
    }
    expect(kid(1024, 768, true)).toEqual([32, 35, 37])
    expect(kid(1280, 800, false)).toEqual([42, 47, 50])
  })

  it("hides behind a tall piece at most LOOK_PLACE.shadow metres of floor for each metre of its height, on every screen the game is played on (the look's placement leaves out what would hide a place so)", () => {
    for (const [width, height, touch] of [[1024, 768, true], [1180, 820, true], [1024, 768, false], [1280, 800, false], [1440, 900, false], [1920, 1080, false], [800, 1200, true]] as const) {
      const v = highView(bounds, floor, { width, height, clearBottom: touch ? padBand(height) : 0, clearTop: hudTop(width, height) }, [0, 0])
      // The line from the eye to the floor's back edge is the shallowest that meets the floor: over a piece h tall it reaches the floor (eye z - back) / eye y times h behind it.
      expect((v.eye[2] - bounds.min[2]) / v.eye[1]).toBeLessThanOrEqual(LOOK_PLACE.shadow)
    }
  })

  it("has Castle Builder's pitch and no turn: x is the screen's right, -z its up, heights rise up the screen", () => {
    const v = highView(bounds, floor, screen, [0, 0])
    const [x0, y0] = highToScreen(v, [0, 0, 0])
    const right = highToScreen(v, [1, 0, 0])
    const back = highToScreen(v, [0, 0, -1])
    const up = highToScreen(v, [0, 1, 0])
    expect(right[0]).toBeGreaterThan(x0)
    expect(right[1]).toBeCloseTo(y0, 0)
    expect(back[1]).toBeLessThan(y0)
    expect(Math.abs(back[0] - x0)).toBeLessThan(1e-6)
    expect(up[1]).toBeLessThan(y0)
    // Looking down at the pitch: its line of sight falls CAMERA_PITCH below level, toward -z.
    expect(Math.atan2(-HIGH_AXES.forward[1], -HIGH_AXES.forward[2])).toBeCloseTo(CAMERA_PITCH)
    expect(v.eye[1]).toBeGreaterThan(bounds.max[1])
    expect(v.eye[2]).toBeGreaterThan(bounds.max[2])
  })

  it('shows the box over the floor frame whole, as big as fits between the HUD and the touch pads, in the middle of them', () => {
    for (const s of [screen, { width: 1024, height: 768, clearBottom: 0, clearTop: 80 }, { width: 800, height: 1200, clearBottom: 300, clearTop: 90 }]) {
      const v = highView(bounds, floor, s, [0, 0])
      const spots = corners(bounds, floor).map((p) => highToScreen(v, p))
      const xs = spots.map((p) => p[0])
      const ys = spots.map((p) => p[1])
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
      expect(x0).toBeGreaterThanOrEqual(-1e-6)
      expect(x1).toBeLessThanOrEqual(s.width + 1e-6)
      expect(y0).toBeGreaterThanOrEqual(s.clearTop - 1e-6)
      expect(y1).toBeLessThanOrEqual(s.height - s.clearBottom + 1e-6)
      // Fitted: it fills the screen's width or the clear band's height, within half a pixel.
      expect(Math.max(x1 - x0 - s.width, y1 - y0 - (s.height - s.clearBottom - s.clearTop))).toBeGreaterThan(-0.5)
      expect((x0 + x1) / 2).toBeCloseTo(s.width / 2, 3)
      expect((y0 + y1) / 2).toBeCloseTo(s.clearTop + (s.height - s.clearBottom - s.clearTop) / 2, 3)
    }
  })

  it('follows a floor frame that moves, and a bigger frame draws the same box smaller', () => {
    const v = highView(bounds, floor, screen, [0, 0])
    const moved = highView(bounds, { ...floor, x: 3, z: -1 }, screen, [0, 0])
    expect(highToScreen(moved, [3, 0, -1])[0]).toBeCloseTo(highToScreen(v, [0, 0, 0])[0], 6)
    const wide = highView({ min: [-12, 0, -7.5], max: [12, 3, 7.5] }, { x: 0, z: 0, width: 24, depth: 15 }, screen, [0, 0])
    const metre = (w: typeof v) => highToScreen(w, [1, 0, 0])[0] - highToScreen(w, [0, 0, 0])[0]
    expect(metre(wide)).toBeLessThan(metre(v))
  })

  it('a point on the screen is a line from the eye through the point in the room drawn there', () => {
    const v = highView(bounds, floor, screen, [0.2, -0.1])
    for (const p of [[0, 0, 0], [5, 1, -3], [-7, 2.5, 4]] as Vec3[]) {
      const [px, py] = highToScreen(v, p)
      const { from, way } = screenRay(v, px, py)
      const k = (p[0] - from[0]) / way[0] || (p[2] - from[2]) / way[2]
      for (let i = 0; i < 3; i++) expect(from[i]! + way[i]! * k).toBeCloseTo(p[i]!, 6)
    }
  })

  it('a line that meets nothing drawn meets the ground at the box bottom', () => {
    const v = highView(bounds, floor, screen, [0, 0])
    const at = highToScreen(v, [2, bounds.min[1], -3])
    const p = rayToGround(screenRay(v, at[0], at[1]), bounds)
    expect(p[0]).toBeCloseTo(2, 6)
    expect(p[1]).toBeCloseTo(bounds.min[1], 9)
    expect(p[2]).toBeCloseTo(-3, 6)
  })

  it("gives three.js a lens whose window is the screen's, and draws the whole box between near and far", () => {
    const v = highView(bounds, floor, screen, [0, 0])
    const [l, r, t, b] = highWindow(v)
    expect((r - l) / (t - b)).toBeCloseTo(screen.width / screen.height, 9)
    for (const p of corners(bounds, floor)) {
      const ahead = (p[0] - v.eye[0]) * HIGH_AXES.forward[0] + (p[1] - v.eye[1]) * HIGH_AXES.forward[1] + (p[2] - v.eye[2]) * HIGH_AXES.forward[2]
      expect(ahead).toBeGreaterThan(v.near)
      expect(ahead).toBeLessThan(v.far)
    }
  })

  it('refuses a screen with no room to draw in', () => {
    expect(() => highView(bounds, floor, { width: 400, height: 300, clearBottom: 200, clearTop: 100 }, [0, 0])).toThrow(/no room to draw in/)
  })
})
