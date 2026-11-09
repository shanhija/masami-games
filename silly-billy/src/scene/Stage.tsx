import { PerspectiveCamera } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { Vector3, type PerspectiveCamera as PerspectiveCameraObject } from 'three'

import { CAMERA_FOV } from '../../../castle-builder/src/scene/look'
import type { ItemInfo, RoomId, World } from '../engine/types'
import { ActorLayer, Actors } from './Actors'
import { Effects } from './Effects'
import { busyPoints, frameFor, Reveals, type Frame } from './frame'
import { Ground } from './Ground'
import { ItemLayer, Items } from './Items'
import type { Clock } from './look'
import { Models } from './recipeMesh'
import { Lamps, SkyDome, SkyLights, Weather } from './Sky'
import { States } from './States'
import { BACK, standBack, View } from './zoom'

/** What the scene draws from: the sim's world (read fresh every frame), the library's models, whether the game is paused, and how close the player has zoomed. */
export interface SceneSource {
  readonly world: World
  info(kind: string): ItemInfo
  readonly libraryVersion: number
  readonly paused: boolean
  readonly view: View
}

/** Seconds the camera stays close after the last one stops, so it does not bob in and out between steps. */
const LINGER = 2.5

/** Advances the game once per frame before anything reads the world (the negative priority sorts it first); a paused game, and the scene's own clock, stand still. */
function Driver({ source, advance, clock }: { source: SceneSource; advance: (dt: number) => void; clock: Clock }) {
  useFrame((_, delta) => {
    if (source.paused) return
    const dt = Math.min(delta, 0.1)
    advance(dt)
    clock.t += dt
  }, -1)
  return null
}

/**
 * Castle Builder's diorama frame: its yaw, pitch and long lens, standing back far enough
 * to keep the frame's ground in view around the aim on any screen. With nobody busy that
 * is the whole room (FRAME_R); when someone does something, the camera moves in on them
 * and on what their step names (frame.ts), on a thing still flying, and on a made thing
 * whose real model has just come, and goes back out a little after. The player's zoom
 * and pan (zoom.ts) go on top.
 */
function CameraRig({ source, aim }: { source: SceneSource; aim: Vector3 }) {
  const camera = useRef<PerspectiveCameraObject>(null!)
  const size = useThree((s) => s.size)
  const held = useRef<{ frame: Frame; until: number; busy: boolean; room: RoomId | null }>({ frame: frameFor([]), until: -1, busy: false, room: null })
  const reveals = useMemo(() => new Reveals(), [])
  useFrame((_, delta) => {
    const w = source.world
    const view = source.view
    const dt = Math.min(delta, 0.1)
    const h = held.current
    reveals.update(w, source.libraryVersion, (kind) => source.info(kind).rough)
    const points = [...busyPoints(w), ...reveals.points(w)]
    if (points.length > 0) {
      h.frame = frameFor(points)
      h.until = w.t + LINGER
      h.busy = true
    } else if (w.t > h.until || w.t < h.until - LINGER) {
      h.frame = frameFor([])
      h.busy = false
    }
    if (w.room !== h.room) {
      if (h.room !== null) view.newRoom()
      h.room = w.room
    }
    const aspect = size.width / size.height
    view.update(h.frame, h.busy, aspect, dt)
    aim.set(view.x, 0, view.z)
    const d = view.r * standBack(aspect)
    const c = camera.current
    c.position.set(aim.x + BACK[0] * d, BACK[1] * d, aim.z + BACK[2] * d)
    c.lookAt(aim)
  })
  return <PerspectiveCamera ref={camera} makeDefault fov={CAMERA_FOV} near={1} far={300} />
}

/** A finger that moves less than this (px) is still tapping; past it, it pans. */
const SLOP = 8
/** Two taps this close in time (ms) and place (px) on the ground are a double tap. */
const DOUBLE_MS = 350
const DOUBLE_PX = 40

/**
 * The player's hands on the camera, over the whole stage: pinch with two fingers and the
 * wheel (or a trackpad) zoom toward the point under them; one finger or the mouse dragged
 * past SLOP pans (zoom.ts lets it only when zoomed in); a double tap on the ground, not on an
 * avatar, goes back to the whole room. A tap stays a tap: an avatar is tapped when the finger
 * goes down (Actors), before any of this, and a drag that starts on one still pans.
 */
function useGestures(stage: RefObject<HTMLDivElement | null>, view: View, tappedActor: { current: boolean }) {
  useEffect(() => {
    const el = stage.current!
    const down = new Map<number, { x: number; y: number; moved: boolean; actor: boolean }>()
    let pinched = false
    let lastTap: { t: number; x: number; y: number } | null = null
    const ndc = (x: number, y: number): [number, number] => [(x / el.clientWidth) * 2 - 1, 1 - (y / el.clientHeight) * 2]
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      down.set(e.pointerId, { x: e.clientX, y: e.clientY, moved: false, actor: tappedActor.current })
      tappedActor.current = false
      if (down.size > 1) pinched = view.dragging = true
    }
    const onMove = (e: PointerEvent) => {
      const p = down.get(e.pointerId)
      if (p === undefined) return
      const [x, y] = [e.clientX, e.clientY]
      if (down.size === 1) {
        if (!p.moved && Math.hypot(x - p.x, y - p.y) < SLOP) return
        if (!p.moved) {
          p.moved = view.dragging = true
          el.style.cursor = 'grabbing'
        }
        view.panBy(ndc(p.x, p.y), ndc(x, y))
      } else {
        // Two fingers: the first other one down. The pinch zooms round where they were, then their middle moves the view.
        const q = [...down.entries()].find(([id]) => id !== e.pointerId)![1]
        const before = ndc((p.x + q.x) / 2, (p.y + q.y) / 2)
        const apart = Math.hypot(p.x - q.x, p.y - q.y)
        const after = ndc((x + q.x) / 2, (y + q.y) / 2)
        const now = Math.hypot(x - q.x, y - q.y)
        if (apart > 10 && now > 10) view.zoomAt(now / apart, before, true)
        view.panBy(before, after)
        p.moved = q.moved = true
      }
      p.x = x
      p.y = y
    }
    const onUp = (e: PointerEvent) => {
      const p = down.get(e.pointerId)
      if (p === undefined) return
      down.delete(e.pointerId)
      if (down.size > 0) return
      view.dragging = false
      el.style.cursor = ''
      const tap = !p.moved && !pinched && !p.actor
      pinched = false
      if (!tap) return
      const t = e.timeStamp
      if (lastTap !== null && t - lastTap.t < DOUBLE_MS && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < DOUBLE_PX) {
        view.reset()
        lastTap = null
      } else lastTap = { t, x: e.clientX, y: e.clientY }
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      // A trackpad's pinch comes as the wheel with ctrl held, in small steps; a mouse wheel's notch is about 100 px, or 3 lines.
      const dy = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 800 : 1)
      view.zoomAt(Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.002)), ndc(e.clientX, e.clientY), false)
    }
    el.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      el.removeEventListener('wheel', onWheel)
    }
  }, [stage, view, tappedActor])
}

/**
 * The room as a diorama under the world's sky: the light, the sun or moon and stars, the ground
 * slab and its water, the things, the people and the animals and the states they are in, the
 * puffs, rain and snow, and the lamps' lights. Drives the game's `advance` once a frame, says
 * which actor a finger tapped, and lets the player zoom and pan.
 */
export function Stage({ source, advance, onTapActor }: { source: SceneSource; advance: (dt: number) => void; onTapActor: (id: string) => void }) {
  const aim = useMemo(() => new Vector3(), [])
  const clock = useMemo<Clock>(() => ({ t: 0 }), [])
  const models = useMemo(() => new Models(source), [source])
  useEffect(() => () => models.dispose(), [models])
  const items = useMemo(() => new ItemLayer(models), [models])
  const actors = useMemo(() => new ActorLayer(models), [models])
  const lampSources = useMemo(() => [items, actors], [items, actors])
  const stage = useRef<HTMLDivElement>(null)
  // An avatar is tapped as the finger goes down, before the stage sees it: that tap is no tap on the ground.
  const tappedActor = useRef(false)
  useGestures(stage, source.view, tappedActor)
  return (
    <div ref={stage} className="stage" style={{ position: 'fixed', inset: 0, touchAction: 'none' }}>
      <Canvas shadows dpr={[1, 1.5]} gl={{ antialias: true, powerPreference: 'high-performance' }}>
        <Driver source={source} advance={advance} clock={clock} />
        <CameraRig source={source} aim={aim} />
        <SkyLights source={source} aim={aim} />
        <SkyDome source={source} />
        <Ground source={source} clock={clock} />
        <Items layer={items} source={source} clock={clock} />
        <Actors
          layer={actors}
          source={source}
          clock={clock}
          onTapActor={(id) => {
            tappedActor.current = true
            onTapActor(id)
          }}
        />
        <States source={source} clock={clock} />
        <Effects source={source} />
        <Weather source={source} aim={aim} clock={clock} />
        <Lamps from={lampSources} aim={aim} source={source} />
      </Canvas>
    </div>
  )
}
