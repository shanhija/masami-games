/**
 * The one canvas. It runs the game's frame, picks taps (one pointerdown, pointermove while down
 * and pointerup on the stage's div, the first pointer only, no events on scene objects) and
 * mounts the world: `Play` for the title and the play, `ShopScene` for the paint shop.
 */

import { useEffect, useRef, useState, type RefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import { InstancedMesh, Mesh } from 'three'

import { useScreenKey } from '../game/game'
import type { Game } from '../game/game'
import { clamp } from '../game/math'
import { HALF } from '../game/model'
import { FOV } from './frame'
import { pickGround, pickMachine, pickRay } from './pick'
import { Play } from './Play'
import { uploadAll } from './preload'
import { ShopScene } from './ShopScene'
import { StudioEnvironment } from './Sky'

/** The game's frame: the sim runs once a frame, before anything draws. */
function Heartbeat({ game }: { game: Game }) {
  useFrame((_, delta) => game.advance(Math.min(delta, 0.1)), -1)
  return null
}

/** Compiles every material and uploads every shape each time a world mounts (`generation` changes), so none is first seen mid-game. */
function Compiler({ generation }: { generation: string }) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    let live = true
    void gl.compileAsync(scene, camera).then(() => {
      if (!live) return
      uploadAll(gl, scene, camera)
      // The upload's render is not a frame of play: `?stats` must not count it.
      gl.info.reset()
    })
    return () => {
      live = false
    }
  }, [gl, scene, camera, generation])
  return null
}

/** Taps and drags on the stage's div: a machine hops, the ground drives, and in pro mode a drag works the levers. */
function Pointer({ game, host }: { game: Game; host: RefObject<HTMLDivElement | null> }) {
  const get = useThree((s) => s.get)
  useEffect(() => {
    const el = host.current!
    let id: number | null = null
    let button = 0
    let lastX = 0
    let lastY = 0
    const ray = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      return pickRay(get().camera, ((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1))
    }
    const ground = (e: PointerEvent) => {
      const hit = pickGround(game.sim.terrain, ray(e))
      return hit === null ? null : { x: clamp(hit.x, -HALF + 2, HALF - 2), z: clamp(hit.z, -HALF + 2, HALF - 2), t: hit.t }
    }
    const down = (e: PointerEvent) => {
      if (id !== null || game.screen !== 'play' || game.paused) return
      id = e.pointerId
      button = e.button
      lastX = e.clientX
      lastY = e.clientY
      el.setPointerCapture(e.pointerId)
      const r = ray(e)
      const machine = pickMachine(game.sim, r)
      const g = ground(e)
      if (machine !== null && (g === null || machine.t <= g.t)) game.tapMachine(machine.kind)
      else if (g !== null) game.groundDown(g.x, g.z)
    }
    const move = (e: PointerEvent) => {
      if (e.pointerId !== id) return
      if (game.sim.mode === 'pro') {
        if (button === 2) game.dragBucket(e.clientY - lastY)
        else game.dragLevers(e.clientX - lastX, e.clientY - lastY)
        lastX = e.clientX
        lastY = e.clientY
        return
      }
      const g = ground(e)
      if (g !== null) game.groundMove(g.x, g.z)
    }
    const up = (e: PointerEvent) => {
      if (e.pointerId !== id) return
      id = null
      game.groundUp()
    }
    const menu = (e: Event) => e.preventDefault()
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('contextmenu', menu)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      el.removeEventListener('contextmenu', menu)
    }
  }, [game, get, host])
  return null
}

/** `?stats`: the draw calls and triangles of the frame, in a corner and on `window.viewerStats`. */
function Stats({ box }: { box: RefObject<HTMLPreElement | null> }) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const last = useRef(0)
  // The info counts every render call of a frame together: read them, then start the next frame from zero.
  gl.info.autoReset = false
  useFrame((state) => {
    const info = gl.info.render
    const seen = { calls: info.calls, triangles: info.triangles }
    gl.info.reset()
    if (state.clock.elapsedTime - last.current < 0.5) return
    last.current = state.clock.elapsedTime
    // The main pass by count: every visible mesh once, and instanced ones by their live count.
    let calls = 0
    let triangles = 0
    const each: { tris: number; at: string }[] = []
    scene.traverseVisible((o) => {
      if (!(o instanceof Mesh)) return
      calls++
      const tris = ((o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3) * (o instanceof InstancedMesh ? o.count : 1)
      triangles += tris
      each.push({ tris: Math.round(tris), at: `${o.geometry.type} at ${o.position.x.toFixed(0)},${o.position.z.toFixed(0)}${o instanceof InstancedMesh ? ` x${o.count}` : ''}` })
    })
    const numbers = { calls, triangles: Math.round(triangles), withShadows: seen, biggest: each.sort((a, b) => b.tris - a.tris).slice(0, 16) }
    ;(window as unknown as { viewerStats: object }).viewerStats = numbers
    box.current!.textContent = `main pass: ${calls} calls, ${numbers.triangles} triangles\nwith shadows: ${seen.calls} calls, ${seen.triangles} triangles`
  })
  return null
}

export function Stage({ game }: { game: Game }) {
  const host = useRef<HTMLDivElement>(null)
  const statsBox = useRef<HTMLPreElement>(null)
  const key = useScreenKey(game)
  const [low, setLow] = useState(false)
  const shadow = low ? 512 : 1024
  return (
    <div ref={host} className="stage">
      <Canvas shadows="percentage" dpr={low ? 1 : [1, 1.25]} gl={{ antialias: true }} camera={{ fov: FOV, near: 0.5, far: 400, position: [0, 40, 40] }}>
        <PerformanceMonitor bounds={() => [40, 120]} onDecline={() => setLow(true)} />
        <Heartbeat game={game} />
        <StudioEnvironment />
        {game.screen === 'shop' ? <ShopScene key={key} game={game} shadow={shadow} /> : <Play key={key} game={game} shadow={shadow} />}
        <Compiler generation={key} />
        <Pointer game={game} host={host} />
        {game.switches.stats && <Stats box={statsBox} />}
      </Canvas>
      {game.switches.stats && <pre ref={statsBox} style={{ position: 'fixed', left: 8, bottom: 8, margin: 0, padding: '4px 8px', background: '#000a', color: '#fff', font: '12px monospace', pointerEvents: 'none' }} />}
    </div>
  )
}
