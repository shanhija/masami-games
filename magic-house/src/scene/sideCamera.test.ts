import { Matrix4, PerspectiveCamera, Quaternion, Euler, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'

import { KID_HEIGHT } from '../../../silly-billy/src/engine/body'
import { FACE_CAMERA } from '../../../silly-billy/src/scene/look'
import { BACK } from '../../../silly-billy/src/scene/zoom'
import { ROOM } from '../engine/api'
import { SIDE_FRAME } from '../engine/camera'
import { padBand } from '../seats/TouchPad'
import { hudTop } from '../shell/Hud'
import { nearWindow, roomToScreen, SHAKE_METRES, shakeOffset, sideView, screenToRoom } from './sideCamera'

const frame = SIDE_FRAME
const [x0, x1] = [frame.x - frame.width / 2, frame.x + frame.width / 2]
const [y0, y1] = [frame.y - frame.height / 2, frame.y + frame.height / 2]

/** A screen as the game keeps it clear: the HUD's band at the top, and on touch the pads' at the bottom. */
const gameScreen = (width: number, height: number, touch: boolean) => ({ width, height, clearBottom: touch ? padBand(height) : 0, clearTop: hudTop(width, height) })

/** Where a point lands on the screen through three.js's own projection of the side view, CSS pixels. */
function project(v: ReturnType<typeof sideView>, screen: { width: number; height: number }, p: [number, number, number]): [number, number] {
  const cam = new PerspectiveCamera()
  cam.position.set(...v.eye)
  cam.updateMatrixWorld()
  const [l, r, t, b] = nearWindow(v)
  cam.projectionMatrix.makePerspective(l, r, t, b, v.near, v.far)
  const ndc = new Vector3(...p).applyMatrix4(cam.matrixWorldInverse).applyMatrix4(cam.projectionMatrix)
  return [((ndc.x + 1) / 2) * screen.width, ((1 - ndc.y) / 2) * screen.height]
}

describe('the side camera', () => {
  it('frames the room with the house round it: x ±8.3 and y -0.4 to 8.4, never moving', () => {
    expect([x0, x1, y0, y1]).toEqual([-ROOM.side.width / 2 - ROOM.wall, ROOM.side.width / 2 + ROOM.wall, -ROOM.lip, ROOM.side.height + ROOM.beam].map((n) => expect.closeTo(n, 9)))
  })

  it('draws a kid 59 px tall on the tablet with its pads, 89 px at 1280 by 800 and 100 px at 1440 by 900 (step 7a)', () => {
    const kid = (width: number, height: number, touch: boolean) => Math.round(KID_HEIGHT * sideView(frame, gameScreen(width, height, touch), [0, 0]).scale)
    expect(kid(1024, 768, true)).toBe(59)
    expect(kid(1280, 800, false)).toBe(89)
    expect(kid(1440, 900, false)).toBe(100)
    // On the tablet the frame's height sets the scale, and the house shows 87 px beside the room on each side.
    const tablet = sideView(frame, gameScreen(1024, 768, true), [0, 0])
    expect(Math.round(roomToScreen(tablet, x0, 0)[0])).toBe(87)
  })

  it("shows the sim's frame exactly: its corners on z = 0 land where the view says, through three's projection", () => {
    const screen = { width: 1328, height: 704, clearBottom: 0, clearTop: 0 }
    const v = sideView(frame, screen, [0, 0])
    const [a, b] = project(v, screen, [x0, y1, 0])
    const [c, d] = project(v, screen, [x1, y0, 0])
    expect(a).toBeCloseTo(0, 6)
    expect(b).toBeCloseTo(0, 6)
    expect(c).toBeCloseTo(1328, 6)
    expect(d).toBeCloseTo(704, 6)
  })

  it('keeps the frame above the clear bottom, standing on it, as big as fits', () => {
    const screen = { width: 1024, height: 768, clearBottom: 200, clearTop: 0 }
    const v = sideView(frame, screen, [0, 0])
    const [, bottom] = roomToScreen(v, 0, y0)
    const [, top] = roomToScreen(v, 0, y1)
    expect(bottom).toBeCloseTo(568)
    expect(top).toBeGreaterThanOrEqual(-1e-6)
    const [left] = roomToScreen(v, x0, 0)
    const [right] = roomToScreen(v, x1, 0)
    expect(left).toBeGreaterThanOrEqual(0)
    expect(right).toBeLessThanOrEqual(1024 + 1e-6)
    expect(Math.min(left, top)).toBeCloseTo(0, 6)
    expect((left + right) / 2).toBeCloseTo(512)
    expect(project(v, screen, [0, y0, 0])[1]).toBeCloseTo(568, 6)
  })

  it('keeps the frame below the clear top too', () => {
    const screen = { width: 1600, height: 800, clearBottom: 0, clearTop: 90 }
    const v = sideView(frame, screen, [0, 0])
    expect(roomToScreen(v, 0, y1)[1]).toBeCloseTo(90)
    expect(roomToScreen(v, 0, y0)[1]).toBeCloseTo(800)
  })

  it("shows more above a frame on a screen taller than it (the house's upper storey), never below its floor's lip", () => {
    const screen = { width: 800, height: 800, clearBottom: 0, clearTop: 0 }
    const v = sideView(frame, screen, [0, 0])
    expect(v.bottom).toBeCloseTo(y0)
    expect(v.top).toBeGreaterThan(y1)
  })

  it('turns a point on the screen into the point in the room under it, and back', () => {
    const screen = { width: 1280, height: 800, clearBottom: 150, clearTop: 0 }
    const v = sideView(frame, screen, [0, 0])
    const p = screenToRoom(v, 300, 200)
    expect(roomToScreen(v, p[0], p[1])).toEqual([expect.closeTo(300, 9), expect.closeTo(200, 9)])
    const q = project(v, screen, p)
    expect(q[0]).toBeCloseTo(300, 6)
    expect(q[1]).toBeCloseTo(200, 6)
  })

  it('looks down onto floors: a near edge shows lower than a far one', () => {
    const screen = { width: 1280, height: 720, clearBottom: 0, clearTop: 0 }
    const v = sideView(frame, screen, [0, 0])
    expect(v.eye[1]).toBeGreaterThan(frame.y + frame.height / 2)
    const near = project(v, screen, [0, 1, 1.5])[1]
    const far = project(v, screen, [0, 1, -1.5])[1]
    expect(near).toBeGreaterThan(far + 10)
  })

  it('refuses a screen with no room above the pads', () => {
    expect(() => sideView(frame, { width: 800, height: 200, clearBottom: 200, clearTop: 0 }, [0, 0])).toThrow(/no room/)
  })

  it('shakes for half a second, fading, the shakes under way adding up', () => {
    expect(shakeOffset([], 1)).toEqual([0, 0])
    const one = [{ strength: 1, born: 1, serial: 1 }]
    const at = (t: number, s = one) => Math.hypot(...shakeOffset(s, t))
    expect(at(1.001)).toBeGreaterThan(SHAKE_METRES * 0.9)
    expect(at(1.25)).toBeLessThan(SHAKE_METRES * 0.55)
    expect(at(1.6)).toBe(0)
    expect(at(1.1, [...one, { strength: 0.5, born: 1.1, serial: 2 }])).toBeGreaterThan(at(1.1))
  })
})

describe("Silly Billy's flat puffs face the live camera", () => {
  it("and its camera's turn is FACE_CAMERA's, so its picture stays as it was", () => {
    const cam = new PerspectiveCamera()
    cam.position.set(BACK[0] * 40, BACK[1] * 40, BACK[2] * 40)
    cam.lookAt(0, 0, 0)
    const fixed = new Quaternion().setFromEuler(new Euler(FACE_CAMERA[0], FACE_CAMERA[1], FACE_CAMERA[2], FACE_CAMERA[3]))
    expect(Math.abs(cam.quaternion.dot(fixed))).toBeCloseTo(1, 9)
    // The rock round the line of sight comes after, as FACE_CAMERA's z did.
    const rocked = new Matrix4().makeRotationFromQuaternion(cam.quaternion.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), 0.3)))
    const before = new Matrix4().makeRotationFromEuler(new Euler(FACE_CAMERA[0], FACE_CAMERA[1], 0.3, FACE_CAMERA[3]))
    rocked.elements.forEach((e, i) => expect(e).toBeCloseTo(before.elements[i]!, 9))
  })
})
