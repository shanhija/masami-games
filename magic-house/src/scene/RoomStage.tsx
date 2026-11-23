/**
 * The stage: the canvas, the room drawn from the world (RoomView) with its look (lookView.ts), the
 * camera showing exactly the sim's frame above the touch pads (from the side sideCamera.ts, from high
 * up highCamera.ts), and Silly Billy's puffs, the World's and the look's props'. Each frame it tries
 * the taps the page gave the look on its props, by the view it draws. It reads the world fresh every
 * frame from its source and never changes it.
 * No shadows: they would add a second pass of every draw call and little a child needs.
 */

import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { PerspectiveCamera } from 'three'

import { CAMERA_PITCH } from '../../../castle-builder/src/scene/look'
import type { Lang } from '../../../profiles/src/lang'
import type { Vec3 } from '../../../silly-billy/src/engine/types'
import { Effects, type PuffSource } from '../../../silly-billy/src/scene/Effects'
import { useLive } from '../../../silly-billy/src/scene/live'
import type { Point } from '../engine/api'
import type { World } from '../engine/world'
import type { WornModels } from './dress'
import { highToScreen, highView, highWindow, rayToGround, screenRay, type HighView } from './highCamera'
import type { StageLook } from './lookView'
import { roomKey, RoomView } from './RoomView'
import { nearWindow, roomToScreen, screenToRoom, shakeOffset, sideView, type Screen, type SideView } from './sideCamera'

/** What the stage draws from: the world as it is now (a new one may come any frame). */
export interface RoomSource {
  readonly world: World
}

/** The view from high up as the stage drew it, with where a line from the eye first meets what it drew (RoomView.pick), or null where it meets nothing. */
export interface HighShown {
  view: HighView
  pick: (from: Vec3, way: Vec3) => Vec3 | null
}

/** Where the stage tells what it shows, each frame, for turning a tap on the screen into a point in the room (pointAt) and a point in the room into one on the screen (screenOf). Both null until the first frame; one of them after it, by the room's view. */
export interface ShownView {
  /** From the side: the side view (sideCamera.ts). */
  view: SideView | null
  /** From high up. */
  high: HighShown | null
}

/**
 * A point on the screen (CSS pixels from the top left) as the point in the room under it, by the
 * view the stage drew last (before its first frame, the view it will draw on `screen`). From the
 * side: on z = 0 (sideCamera.ts screenToRoom). From high up: where the line from the eye through it
 * first meets something drawn (a floor, a top, a wall, a thing, decor, a sign, the ground; never a
 * player, a zone, a glow, a pop or the way out: RoomView.pick), else the ground plane at the box's
 * bottom (seats/types.ts Tap).
 */
export function pointAt(shown: ShownView, world: World, screen: Screen, px: number, py: number): Point {
  if (world.view === 'side') return screenToRoom(shown.view ?? sideView(world.camera, screen, [0, 0]), px, py)
  const ray = screenRay(shown.high?.view ?? highView(world.bounds, world.floorFrame!, screen, [0, 0]), px, py)
  return shown.high?.pick(ray.from, ray.way) ?? rayToGround(ray, world.bounds)
}

/** A point in the room as the point on the screen over it, CSS pixels from the top left, by the view the stage drew last; null before its first frame. */
export function screenOf(shown: ShownView, at: Vec3): [number, number] | null {
  if (shown.high !== null) return highToScreen(shown.high.view, at)
  return shown.view === null ? null : roomToScreen(shown.view, at[0], at[1])
}

interface StageProps {
  source: RoomSource
  lang: Lang
  /** CSS pixels at the bottom of the screen the room keeps clear for the touch pads: 0 without them. */
  clearBottom: number
  /** CSS pixels at the top the frame keeps clear for the HUD's band: 0 without a HUD. */
  clearTop: number
  worn: WornModels
  shown: ShownView
  /** The house drawn round the room (RoomView): every room of the game has it; a sheet's stand of kids, wider than a room, has not. */
  house: boolean
  /** The room's look as built on the room played, with the page's taps for its props and where their sounds go; null for none (the end, the sheets of kids, a room without a look). */
  look: StageLook | null
}

/** Draws the room and moves the camera, every frame. */
function Room({ source, lang, clearBottom, clearTop, worn, shown, house, look }: StageProps) {
  const key = useLive(() => roomKey(source.world))
  // The latest lookup of worn models, read through a ref so a new function from the page does not build the room again.
  const wornNow = useRef(worn)
  wornNow.current = worn
  // A new room, a new view; the world it is built from is the one of the frame the key changed in.
  const room = useMemo(() => new RoomView(source.world, (id) => wornNow.current(id), house, look), [key, house, look])
  useEffect(() => () => room.dispose(), [room])
  // The puffs the stage draws: the World's, and the look's props' beside them.
  const puffs = useMemo<PuffSource>(() => ({ world: { get t() { return source.world.t }, get puffs() { return room.puffsWith(source.world.puffs) } } }), [source, room])
  const camera = useMemo(() => {
    const c = new PerspectiveCamera()
    // The stage sets its projection itself every frame: three's own resize must leave it be.
    ;(c as PerspectiveCamera & { manual: boolean }).manual = true
    return c
  }, [])
  const set = useThree((s) => s.set)
  const scene = useThree((s) => s.scene)
  const size = useThree((s) => s.size)
  useEffect(() => set({ camera }), [set, camera])
  useFrame((_, delta) => {
    const w = source.world
    room.update(w, w.t, Math.min(delta, 0.1), lang)
    scene.background = room.background
    const screen = { width: size.width, height: size.height, clearBottom, clearTop }
    const shake = shakeOffset(w.shakes, w.t)
    let lens: [number, number, number, number]
    if (w.view === 'high') {
      const v = highView(w.bounds, w.floorFrame!, screen, shake)
      camera.position.set(v.eye[0], v.eye[1], v.eye[2])
      // Tipped down round x, never turned round y.
      camera.rotation.set(-CAMERA_PITCH, 0, 0)
      camera.near = v.near
      camera.far = v.far
      lens = highWindow(v)
      shown.view = null
      shown.high = { view: v, pick: room.pick }
      for (const tap of look?.taps.splice(0) ?? []) {
        const ray = screenRay(v, tap.x, tap.y)
        room.tapRay(ray.from, ray.way)
      }
    } else {
      const v = sideView(w.camera, screen, shake)
      camera.position.set(v.eye[0], v.eye[1], v.eye[2])
      camera.quaternion.identity()
      camera.near = v.near
      camera.far = v.far
      lens = nearWindow(v)
      shown.view = v
      shown.high = null
      for (const tap of look?.taps.splice(0) ?? []) room.tapAt(screenToRoom(v, tap.x, tap.y))
    }
    const [l, r, t, b] = lens
    camera.projectionMatrix.makePerspective(l, r, t, b, camera.near, camera.far)
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
    camera.updateMatrixWorld()
  })
  return (
    <>
      <primitive object={room.root} />
      <Effects source={puffs} />
    </>
  )
}

/** The room on a canvas over the whole page. `children` go inside the canvas (a meter, in the sheet). */
export function RoomStage({ children, ...props }: StageProps & { children: ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, touchAction: 'none' }}>
      <Canvas dpr={[1, 1.5]} gl={{ antialias: true, powerPreference: 'high-performance' }}>
        <Room {...props} />
        {children}
      </Canvas>
    </div>
  )
}
