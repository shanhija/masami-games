/**
 * The camera. Easy mode looks north from the south at a fixed yaw and a 50 degree tilt, so a tap
 * and a direction always mean the same on the screen; it frames the active machine and the step's
 * ring together inside the free part of the screen (the window less the HUD, see `free.ts`),
 * follows the machine with a little lead when they are far apart, pulls back for the cranes,
 * looks at a watched place, goes to a party and drifts over the valley on the title.
 * Pro mode adds a camera behind the machine and one in its cab.
 */

import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { PerspectiveCamera, Vector3 } from 'three'

import type { Game } from '../game/game'
import { damp, lerp, turnTo } from '../game/math'
import { MACHINE_SPECS } from '../game/model'
import type { Machine, Pointer, Sim } from '../game/model'
import { seatPoint } from '../game/machines'
import { stepPointer } from '../game/sim'
import { groundY } from '../game/world'
import { aimAt, areaTans, around, basis, CHEST, createEasyBuffers, EASY_YAW, easyGoal, fit, FOV, lensShift, machinePoints, NARROWEST, partyFit, pullIn, ringPoints, TOGETHER, type Pt } from './frame'
import { freeArea, watchHud } from './free'
import { PARTY_TILT, partyAnimals, partyPoints } from './parties'

/** What the camera works out each frame and the rest of the scene reads. */
export interface View {
  /** What the open step points at, worked out once a frame (null on the title). */
  pointer: Pointer | null
  /** The ground point the camera looks at, and how far the camera is from it. */
  x: number
  z: number
  dist: number
  /** The screen's up as a world yaw. */
  yaw: number
  /** The points the child must see this frame: the active machine, the step's target, a party's landmark. */
  focus: Pt[]
  /** Seconds this frame lasts for easing: the real time, or all the sim time that passed since the last frame when it ran ahead. */
  dt: number
}

export const createView = (): View => ({ pointer: null, x: 0, z: 0, dist: 40, yaw: Math.PI, focus: [], dt: 0 })

/** Easy mode's tilt below the horizon. */
const TILT = (50 * Math.PI) / 180
/** The most sim time one frame eases by, in seconds. */
const MOST_DT = 3

/** What must not be hidden: the machine's middle, nose and tail, and the target's middle and four sides of its ring. */
function focusOf(pts: Pt[], m: Machine, p: Pointer | null): void {
  const half = MACHINE_SPECS[m.kind].length / 2
  const fx = Math.sin(m.yaw) * half
  const fz = Math.cos(m.yaw) * half
  pts.push([m.x, m.y + CHEST, m.z], [m.x + fx, m.y + CHEST, m.z + fz], [m.x - fx, m.y + CHEST, m.z - fz])
  if (p === null) return
  ringPoints(pts, p.x, p.y, p.z, p.ring)
}

/** The seat's facing in the world: the machine's, with the digger's turret and the tower's jib. */
const seatYaw = (m: Machine) => (m.kind === 'digger' ? m.yaw + m.swing : m.kind === 'tower' ? m.jib : m.yaw)

/** Places the camera every frame from the state of the sim, and tells the game how to project a world point onto the screen. */
export function Camera({ game, view }: { game: Game; view: View }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const get = useThree((s) => s.get)
  const cur = useMemo(() => ({ ready: false, party: false, cx: 0, cy: 0, cz: 0, d: 50, yaw: EASY_YAW, tilt: TILT, shiftX: 0, shiftY: 0, clock: 0 }), [])
  const eye = useMemo(() => new Vector3(), [])
  const look = useMemo(() => new Vector3(), [])
  const probe = useMemo(() => new Vector3(), [])
  const pts = useMemo<Pt[]>(() => [], [])
  const easy = useMemo(createEasyBuffers, [])

  useEffect(() => {
    camera.fov = FOV
    camera.updateProjectionMatrix()
    game.project = (x, y, z) => {
      const { size } = get()
      probe.set(x, y, z).project(camera)
      return { x: ((probe.x + 1) / 2) * size.width, y: ((1 - probe.y) / 2) * size.height, onScreen: probe.z < 1 && Math.abs(probe.x) <= 1 && Math.abs(probe.y) <= 1 }
    }
    return () => {
      game.project = null
    }
  }, [camera, game, get, probe])

  useEffect(() => watchHud(), [])

  useFrame((state, delta) => {
    const sim: Sim = game.sim
    const { width, height } = state.size
    const dt = Math.min(Math.max(Math.min(delta, 0.1), cur.ready ? game.clock - cur.clock : 0), MOST_DT)
    cur.clock = game.clock
    view.dt = dt
    camera.aspect = width / height
    // The screen's free part in the canvas's pixels, and the tans of the half angles it spans.
    const pixels = freeArea()
    const scale = width / globalThis.innerWidth
    const free = { left: pixels.left * scale, top: pixels.top * scale, right: pixels.right * scale, bottom: pixels.bottom * scale }
    const { tanH, tanV } = areaTans(Math.tan((FOV * Math.PI) / 360), height, free)
    const m = sim.machines[sim.active]
    const title = game.screen === 'title'
    view.pointer = title ? null : stepPointer(sim)
    view.focus.length = 0
    let yaw = EASY_YAW
    let direct = false
    let tiltGoal = TILT
    let cut = false
    if (title) {
      const t = game.clock
      pts.length = 0
      const x = Math.sin(t * 0.045) * 14
      const z = 8 + Math.cos(t * 0.031) * 8
      around(pts, x, 0, z, 26, 14, 4)
      const f = fit(pts, EASY_YAW, cur.tilt, tanH, tanV, NARROWEST, null, null)
      snap(cur, f.cx, groundY(sim, x, z), f.cz, f.d, dt, 0.8)
    } else if (sim.party !== null) {
      // The party's first frame cuts to its view: easing in from the play view would sweep over the machines that just drove out of it.
      cut = !cur.party
      tiltGoal = PARTY_TILT[sim.party.chapter]
      if (cut) {
        cur.ready = false
        cur.tilt = tiltGoal
      }
      partyPoints(pts, sim)
      view.focus.push(...pts)
      partyAnimals(view.focus, sim)
      const f = partyFit(pts, cur.tilt, tanH, tanV)
      snap(cur, f.cx, f.cy, f.cz, f.d, dt, 1.4)
    } else if (game.sim.mode === 'pro' && game.cameraMode !== 'high') {
      direct = true
      focusOf(view.focus, m, null)
      const spec = MACHINE_SPECS[m.kind]
      const heading = game.cameraMode === 'cab' ? seatYaw(m) : m.kind === 'tower' ? m.jib : m.yaw
      cur.yaw = cur.ready ? cur.yaw + turnTo(cur.yaw, heading) * damp(game.cameraMode === 'cab' ? 9 : 2.5, dt) : heading
      yaw = cur.yaw
      const fx = Math.sin(yaw)
      const fz = Math.cos(yaw)
      if (game.cameraMode === 'cab') {
        const seat = seatPoint(m)
        eye.set(seat.x + fx * 0.3, seat.y + 0.95, seat.z + fz * 0.3)
        look.set(eye.x + fx * 12, eye.y - 1.6, eye.z + fz * 12)
      } else {
        const size = m.kind === 'tower' ? 26 : Math.max(spec.length, 5)
        const back = 8 + size * 0.9
        const high = 3.5 + size * 0.6
        look.set(m.x + fx * 4, m.y + 1.6, m.z + fz * 4)
        eye.set(m.x - fx * back, m.y + high, m.z - fz * back)
      }
      view.dist = eye.distanceTo(look)
      if (cur.ready) camera.position.lerp(eye, damp(8, dt))
      else camera.position.copy(eye)
      cur.ready = true
      camera.lookAt(look)
      view.x = look.x
      view.z = look.z
    } else {
      const watch = sim.job === null ? null : sim.job.job.steps[sim.job.step]
      focusOf(view.focus, m, view.pointer)
      if (watch !== null && watch.kind === 'watch') {
        pts.length = 0
        around(pts, watch.x, groundY(sim, watch.x, watch.z), watch.z, 9, 9, 4)
        view.focus.push([watch.x, groundY(sim, watch.x, watch.z) + 0.5, watch.z])
        aimAt(easy, m)
        easy.must.length = 0
        if (Math.hypot(m.x - watch.x, m.z - watch.z) <= TOGETHER) {
          machinePoints(pts, m, 0)
          easy.must.push(easy.chest)
        }
        const f = fit(pts, EASY_YAW, cur.tilt, tanH, tanV, NARROWEST, null, null)
        snap(cur, f.cx, f.cy, f.cz, f.d, dt, 3)
      } else {
        const goal = easyGoal(easy, m, view.pointer, cur.tilt, tanH, tanV)
        snap(cur, goal.cx, goal.cy, goal.cz, goal.d, dt, 3)
      }
      // What must be inside is inside from the first frame, however far the easing is behind; the machine comes last, so it wins.
      for (const q of easy.must) {
        const to = pullIn(cur, yaw, cur.tilt, tanH, tanV, q)
        cur.cx = to.cx
        cur.cz = to.cz
      }
    }
    if (!direct) {
      cur.tilt = cur.ready ? lerp(cur.tilt, tiltGoal, damp(2, dt)) : tiltGoal
      const { fwd } = basis(yaw, cur.tilt)
      camera.position.set(cur.cx - fwd[0] * cur.d, cur.cy - fwd[1] * cur.d, cur.cz - fwd[2] * cur.d)
      camera.lookAt(cur.cx, cur.cy, cur.cz)
      view.x = cur.cx
      view.z = cur.cz
      view.dist = cur.d
    }
    // The lens is shifted so what the camera looks at lands in the middle of the free area.
    const shift = direct ? { x: 0, y: 0 } : lensShift(width, height, free)
    const k = damp(6, dt)
    cur.shiftX = cut ? shift.x : lerp(cur.shiftX, shift.x, k)
    cur.shiftY = cut ? shift.y : lerp(cur.shiftY, shift.y, k)
    cur.party = sim.party !== null
    camera.setViewOffset(width, height, cur.shiftX, cur.shiftY, width, height)
    view.yaw = yaw
    game.setViewYaw(yaw)
    camera.updateMatrixWorld()
  }, -0.5)
  return null
}

/** Eases the middle and the distance toward a goal; the first frame jumps. */
function snap(cur: { ready: boolean; cx: number; cy: number; cz: number; d: number }, cx: number, cy: number, cz: number, d: number, dt: number, rate: number): void {
  if (!cur.ready) {
    cur.ready = true
    cur.cx = cx
    cur.cy = cy
    cur.cz = cz
    cur.d = d
    return
  }
  const k = damp(rate, dt)
  cur.cx = lerp(cur.cx, cx, k)
  cur.cy = lerp(cur.cy, cy, k)
  cur.cz = lerp(cur.cz, cz, k)
  cur.d = lerp(cur.d, d, damp(rate * 0.6, dt))
}
