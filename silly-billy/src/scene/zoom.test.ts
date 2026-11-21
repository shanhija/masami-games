import { Plane, PerspectiveCamera, Raycaster, Vector2, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'

import { ease } from '../../../castle-builder/src/game/math'
import { CAMERA_FOV } from '../../../castle-builder/src/scene/look'
import { ROOM_HALF } from '../engine/types'
import { CLOSE_R, ROOM, type Frame } from './frame'
import { FRAME_R } from './look'
import { BACK, groundUnit, MIN_R, shownR, standBack, View, ZOOM_STEP } from './zoom'
const LAPTOP = 1180 / 820
const IPAD = 820 / 1180
const DT = 1 / 60

/** Frames of `secs` seconds with this frame and business, on a laptop's screen, the whole room `room`. */
function run(view: View, frame: Frame, busy: boolean, secs: number, each?: () => void, room = ROOM) {
  for (let i = 0; i < Math.round(secs * 60); i++) {
    view.update(frame, room, busy, LAPTOP, DT)
    each?.()
  }
}

/** A view settled on the whole room, as the page starts. */
function settled() {
  const view = new View()
  run(view, ROOM, false, 0.1)
  return view
}

const near = (a: readonly number[], b: readonly number[], eps = 1e-6) => a.every((v, i) => Math.abs(v - b[i]!) < eps)

describe('where the camera stands', () => {
  it('finds the ground under a point of the screen the way three.js sees it from the camera Stage places', () => {
    for (const [aspect, y] of [
      [LAPTOP, 0],
      [IPAD, 0],
      [2.2, 0],
      [LAPTOP, 10.3],
    ] as const) {
      // Up on a roof, the ground is the roof's level.
      const plane = new Plane(new Vector3(0, 1, 0), -y)
      const [aim, r] = [new Vector3(3, y, -2), 4.5]
      const d = r * standBack(aspect)
      const camera = new PerspectiveCamera(CAMERA_FOV, aspect, 1, 300)
      camera.position.set(aim.x + BACK[0] * d, aim.y + BACK[1] * d, aim.z + BACK[2] * d)
      camera.lookAt(aim)
      camera.updateMatrixWorld()
      camera.updateProjectionMatrix()
      const ray = new Raycaster()
      for (const [nx, ny] of [
        [0, 0],
        [0.5, -0.3],
        [-1, -1],
        [1, 1],
        [-1, 1],
        [0.2, 0.9],
      ] as const) {
        ray.setFromCamera(new Vector2(nx, ny), camera)
        const hit = ray.ray.intersectPlane(plane, new Vector3())!
        expect(near(groundUnit(nx, ny, aspect), [(hit.x - aim.x) / r, (hit.z - aim.z) / r])).toBe(true)
      }
    }
  })
})

describe('the zoom', () => {
  it('at 0 is the game’s own frame exactly as before, up onto a roof too, and a drag there changes nothing', () => {
    const view = new View()
    const old = { x: 0, y: 0, z: 0, r: FRAME_R }
    const busy: Frame = { x: 6, y: 0, z: -4, r: CLOSE_R }
    const roof: Frame = { x: -4, y: 10.3, z: -6, r: CLOSE_R }
    for (const [frame, isBusy, secs] of [
      [ROOM, false, 0.5],
      [busy, true, 2],
      [roof, true, 3],
      [ROOM, false, 3],
    ] as const) {
      for (let i = 0; i < secs * 60; i++) {
        view.panBy([0, 0], [0.3, 0.2])
        if (i % 20 === 0 && !isBusy) view.reset()
        view.update(frame, ROOM, isBusy, LAPTOP, DT)
        old.x = ease(old.x, frame.x, DT, 0.8)
        old.y = ease(old.y, frame.y, DT, 0.8)
        old.z = ease(old.z, frame.z, DT, 0.8)
        old.r = ease(old.r, frame.r, DT, 1)
        expect(near([view.x, view.y, view.z, view.r], [old.x, old.y, old.z, old.r], 1e-9)).toBe(true)
      }
    }
  })

  it('goes from the whole room all the way in in four presses, no further either way, each − always wider', () => {
    const view = settled()
    view.step(-1, [])
    expect(view.goal).toBe(0)
    const rs = [view.r]
    for (let i = 0; i < 4; i++) {
      view.step(1, [])
      run(view, ROOM, false, 1.5)
      rs.push(view.r)
    }
    expect(view.goal).toBe(1)
    expect(view.r).toBeCloseTo(MIN_R, 6)
    view.step(1, [])
    expect(view.goal).toBe(1)
    for (let i = 1; i < rs.length; i++) expect(rs[i]!).toBeLessThan(rs[i - 1]! / 1.5)
    // All the way in, the game's close-ups make no difference: one or two avatars fill the screen either way.
    expect(shownR(CLOSE_R, FRAME_R, 1)).toBeCloseTo(MIN_R, 9)
    for (let t = ZOOM_STEP - 1; t <= 1; t += ZOOM_STEP) for (const r of [CLOSE_R, 10]) expect(shownR(r, FRAME_R, t)).toBeLessThan(shownR(r, FRAME_R, t - ZOOM_STEP))
    expect(shownR(CLOSE_R, FRAME_R, -1)).toBeCloseTo(FRAME_R, 9)
    // The wheel stops at the ends too.
    view.zoomAt(1e6, [0, 0], false)
    expect(view.goal).toBe(1)
    view.zoomAt(1e-6, [0, 0], true)
    expect([view.goal, view.t]).toEqual([0, 0])
  })

  it('eases smoothly to where a press sends it, without overshooting, in about a second', () => {
    const view = settled()
    view.step(1, [])
    const ts: number[] = []
    run(view, ROOM, false, 1.2, () => ts.push(view.t))
    for (let i = 1; i < ts.length; i++) {
      expect(ts[i]!).toBeGreaterThanOrEqual(ts[i - 1]!)
      expect(ts[i]! - ts[i - 1]!).toBeLessThan(ZOOM_STEP / 8)
    }
    expect(ts[5]!).toBeLessThan(ZOOM_STEP / 2)
    expect(ts.at(-1)).toBe(ZOOM_STEP)
    expect(Math.max(...ts)).toBe(ZOOM_STEP)
  })

  it('keeps the ground under the cursor where it is while the wheel’s zoom eases', () => {
    const view = settled()
    const at = [0.4, -0.3] as const
    const ground = view.groundAt(at)
    view.zoomAt(2.5, at, false)
    run(view, ROOM, false, 1.5, () => expect(near(view.groundAt(at), ground, 1e-6)).toBe(true))
    expect(view.r).toBeCloseTo(FRAME_R / 2.5, 6)
  })

  it('follows two fingers: a pinch zooms at once round their middle, and their middle moving pans', () => {
    const view = settled()
    view.step(1, [])
    run(view, ROOM, false, 1.5)
    const [from, to] = [[0.1, 0.2], [0.25, 0.1]] as const
    const ground = view.groundAt(from)
    const r = view.r
    view.zoomAt(1.6, from, true)
    expect(view.r).toBeCloseTo(r / 1.6, 9)
    expect(near(view.groundAt(from), ground)).toBe(true)
    view.panBy(from, to)
    expect(near(view.groundAt(to), ground)).toBe(true)
    // The next frames leave it there.
    run(view, ROOM, false, 0.5)
    expect(near(view.groundAt(to), ground, 1e-6)).toBe(true)
  })

  it('pans with one finger only when zoomed in: the ground under it goes with it', () => {
    const view = settled()
    view.panBy([0, 0], [0.5, 0.5])
    expect([view.x, view.z]).toEqual([0, 0])
    view.step(1, [])
    view.step(1, [])
    run(view, ROOM, false, 1.5)
    const ground = view.groundAt([0, 0])
    view.panBy([0, 0], [-0.2, 0.15])
    expect(near(view.groundAt([-0.2, 0.15]), ground)).toBe(true)
    run(view, ROOM, false, 2)
    expect(near(view.groundAt([-0.2, 0.15]), ground, 1e-6)).toBe(true)
  })

  it('never leaves the room, however far it is dragged or zoomed, and never pulls in the game’s own aim', () => {
    const view = settled()
    for (let i = 0; i < 4; i++) view.step(1, [])
    run(view, ROOM, false, 1.5)
    const edge = ROOM_HALF + 1 - MIN_R
    for (let i = 0; i < 200; i++) view.panBy([0, 0], [-0.9, 0.9])
    run(view, ROOM, false, 2)
    expect(Math.max(Math.abs(view.x), Math.abs(view.z))).toBeCloseTo(edge, 6)
    // A random player for a minute: pinches, wheels, presses, drags, actions coming and going.
    let seed = 7
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1
    for (let i = 0; i < 3600; i++) {
      const roll = (rnd() + 1) / 2
      if (roll < 0.3) view.panBy([rnd(), rnd()], [rnd(), rnd()])
      else if (roll < 0.4) view.zoomAt(Math.exp(rnd()), [rnd(), rnd()], roll < 0.35)
      else if (roll < 0.42) view.step(rnd() > 0 ? 1 : -1, [{ x: rnd() * 12, z: rnd() * 12 }])
      else if (roll < 0.43) view.reset()
      else if (roll < 0.44) view.follow()
      const busy = Math.floor(i / 300) % 2 === 1
      view.update(busy ? { x: 5, y: 0, z: 5, r: CLOSE_R } : ROOM, ROOM, busy, LAPTOP, DT)
      expect(view.goal).toBeGreaterThanOrEqual(busy ? -1 : 0)
      expect(view.goal).toBeLessThanOrEqual(1)
      expect(view.r).toBeGreaterThanOrEqual(MIN_R - 1e-9)
      expect(view.r).toBeLessThanOrEqual(FRAME_R + 1e-9)
      expect(Math.max(Math.abs(view.x), Math.abs(view.z))).toBeLessThan(ROOM_HALF + 1)
    }
    // Zoomed out, an actor in a corner is still framed where the game always framed them.
    const corner: Frame = { x: 11.5, y: 0, z: -11.5, r: CLOSE_R }
    const out = new View()
    run(out, corner, true, 8)
    expect(near([out.x, out.z], [corner.x, corner.z], 1e-3)).toBe(true)
    // And zoomed in, the camera still goes to them.
    for (let i = 0; i < 3; i++) out.step(1, [])
    run(out, corner, true, 8)
    expect(near([out.x, out.z], [corner.x, corner.z], 1e-3)).toBe(true)
  })

  it('goes to a new action from wherever it was panned, stays put when everyone is done, and a double tap goes back to the whole room', () => {
    const view = settled()
    view.step(1, [])
    view.step(1, [])
    run(view, ROOM, false, 1.5)
    view.panBy([0, 0], [0.4, 0.4])
    run(view, ROOM, false, 2)
    const panned = [view.x, view.z]
    expect(Math.hypot(panned[0]!, panned[1]!)).toBeGreaterThan(1)
    // Alice jumps on the other side: the camera goes to her.
    const alice: Frame = { x: -5, y: 0, z: 6, r: CLOSE_R }
    run(view, alice, true, 10)
    expect(near([view.x, view.z], [alice.x, alice.z], 1e-3)).toBe(true)
    // She is done: the view stays on her, a little wider as the game's frame goes back out.
    const r = view.r
    run(view, ROOM, false, 10)
    expect(near([view.x, view.z], [alice.x, alice.z], 1e-3)).toBe(true)
    expect(view.r).toBeGreaterThan(r)
    // A double tap: the whole room, as the game frames it.
    view.reset()
    run(view, ROOM, false, 12)
    expect(near([view.x, view.z, view.r], [0, 0, FRAME_R], 1e-3)).toBe(true)
  })

  it('leaves the view under a finger that is panning when an action starts', () => {
    const view = settled()
    view.step(1, [])
    view.step(1, [])
    run(view, ROOM, false, 1.5)
    view.panBy([0, 0], [0.1, 0.15])
    run(view, ROOM, false, 2)
    const panned = [view.x, view.z]
    expect(Math.hypot(panned[0]!, panned[1]!)).toBeGreaterThan(0.5)
    view.dragging = true
    run(view, { x: -5, y: 0, z: 6, r: CLOSE_R }, true, 0.1)
    view.dragging = false
    run(view, { x: -5, y: 0, z: 6, r: CLOSE_R }, true, 10)
    // The pan stays on top of the action's own aim, which moved by (-5, 6).
    expect(near([view.x, view.z], [panned[0]! - 5, panned[1]! + 6], 1e-3)).toBe(true)
  })

  it('zooms toward the people with + when nobody is busy, and toward the action when someone is', () => {
    const view = settled()
    const people = [
      { x: 4, z: 3 },
      { x: 6, z: 5 },
    ]
    // Where they are on the screen stays where it was while they grow.
    const offset = () => [(5 - view.x) / view.r, (4 - view.z) / view.r]
    const before = offset()
    view.step(1, people)
    run(view, ROOM, false, 1.5, () => expect(near(offset(), before, 1e-6)).toBe(true))
    expect(view.r).toBeLessThan(FRAME_R / 1.5)
    // Busy: the middle of the action stays the middle.
    const busy: Frame = { x: -3, y: 0, z: 2, r: CLOSE_R }
    run(view, busy, true, 6)
    view.step(1, people)
    run(view, busy, true, 6)
    expect(near([view.x, view.z], [busy.x, busy.z], 1e-3)).toBe(true)
  })

  it('zooms out past the game’s close-up to the whole room while someone is busy, a step at a time, and stays out', () => {
    const view = settled()
    const busy: Frame = { x: 6, y: 0, z: -4, r: CLOSE_R }
    run(view, busy, true, 6)
    expect(view.outmost).toBe(false)
    const rs = [view.r]
    for (let i = 0; i < 4; i++) {
      view.step(-1, [])
      run(view, busy, true, 1.5)
      rs.push(view.r)
    }
    for (let i = 1; i < rs.length; i++) expect(rs[i]!).toBeGreaterThan(rs[i - 1]! * 1.2)
    expect([view.goal, view.outmost]).toEqual([-1, true])
    view.step(-1, [])
    expect(view.goal).toBe(-1)
    run(view, busy, true, 8)
    expect(near([view.x, view.y, view.z, view.r], [0, 0, 0, FRAME_R], 1e-3)).toBe(true)
    // + comes back in: to the action first, then closer.
    view.step(1, [])
    run(view, busy, true, 2)
    expect(view.goal).toBe(-0.75)
    // The wheel and a pinch go out past it too, and no further than the whole room.
    view.zoomAt(1e-6, [0.3, 0.3], false)
    expect(view.goal).toBe(-1)
    view.zoomAt(4, [0, 0], true)
    expect(view.goal).toBeGreaterThan(0)
    view.zoomAt(1e-6, [0, 0], true)
    expect([view.goal, view.t]).toEqual([-1, -1])
  })

  it('a double tap while someone is busy goes to the whole room; a new command or a face tapped comes back', () => {
    const view = settled()
    const busy: Frame = { x: 6, y: 0, z: -4, r: CLOSE_R }
    view.step(1, [])
    run(view, busy, true, 6)
    view.reset()
    run(view, busy, true, 8)
    expect(near([view.x, view.z, view.r], [0, 0, FRAME_R], 1e-3)).toBe(true)
    view.follow()
    run(view, busy, true, 8)
    expect(near([view.x, view.z, view.r], [busy.x, busy.z, CLOSE_R], 1e-3)).toBe(true)
  })

  it('stays as far out as it was when everyone is done, without a jump, and is then at its own frame', () => {
    const view = settled()
    const busy: Frame = { x: 6, y: 0, z: -4, r: CLOSE_R }
    run(view, busy, true, 6)
    view.step(-1, [])
    view.step(-1, [])
    run(view, busy, true, 0.2)
    let [x, r] = [view.x, view.r]
    run(view, ROOM, false, 10, () => {
      expect(Math.abs(view.r - r)).toBeLessThan(0.2)
      expect(Math.abs(view.x - x)).toBeLessThan(0.2)
      ;[x, r] = [view.x, view.r]
    })
    expect([view.goal, view.t, view.outmost]).toEqual([0, 0, true])
    expect(near([view.x, view.z, view.r], [0, 0, FRAME_R], 1e-3)).toBe(true)
  })

  it('goes out as wide as the whole room is while something tall stands in it', () => {
    const view = settled()
    const busy: Frame = { x: -4, y: 10.3, z: -6, r: CLOSE_R }
    const tall: Frame = { ...ROOM, r: 19 }
    run(view, busy, true, 6, undefined, tall)
    expect(view.y).toBeCloseTo(10.3, 1)
    view.reset()
    run(view, busy, true, 10, undefined, tall)
    expect(near([view.x, view.y, view.z, view.r], [0, 0, 0, 19], 1e-3)).toBe(true)
  })

  it('drops the pan in another room', () => {
    const view = settled()
    view.step(1, [])
    view.step(1, [])
    run(view, ROOM, false, 1.5)
    view.panBy([0, 0], [0.5, -0.5])
    view.newRoom()
    run(view, ROOM, false, 8)
    expect(near([view.x, view.z], [0, 0], 1e-3)).toBe(true)
  })
})
