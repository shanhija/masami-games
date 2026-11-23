/**
 * The scene measured against SCENE_LIMITS, for headless checks: the scene's sheet and the room
 * screen under ?debug on the dev server put it inside the stage. window.sceneStats holds the draw
 * calls and the scene's milliseconds a frame (the mean and the worst of the last two seconds), and
 * the worst draw calls seen since it started, for a headless script to read.
 */

import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'

import { SCENE_LIMITS } from './limits'

export interface SceneStats {
  fixture: string
  calls: number
  /** The most draw calls of any frame since the meter started. */
  mostCalls: number
  triangles: number
  meanMs: number
  worstMs: number
  frames: number
  limits: typeof SCENE_LIMITS
  /** Within the limits: the most draw calls seen, and the scene's mean milliseconds a frame. */
  within: boolean
}

declare global {
  interface Window {
    sceneStats?: SceneStats
  }
}

/** Times the scene's work each frame (every update from the first to the render) and counts its draw calls. It renders the frame itself, so it is last. */
export function Meter({ name }: { name: string }) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const start = useRef(0)
  const times = useRef<number[]>([])
  const most = useRef(0)
  useFrame(() => {
    start.current = performance.now()
  }, -1000)
  useFrame((state) => {
    gl.render(scene, state.camera)
    const ms = performance.now() - start.current
    const list = times.current
    list.push(ms)
    if (list.length > 120) list.shift()
    const calls = gl.info.render.calls
    most.current = Math.max(most.current, calls)
    const meanMs = list.reduce((a, b) => a + b, 0) / list.length
    window.sceneStats = {
      fixture: name,
      calls,
      mostCalls: most.current,
      triangles: gl.info.render.triangles,
      meanMs,
      worstMs: Math.max(...list),
      frames: list.length,
      limits: SCENE_LIMITS,
      within: most.current <= SCENE_LIMITS.drawCalls && meanMs <= SCENE_LIMITS.frameMs,
    }
  }, 1000)
  return null
}
