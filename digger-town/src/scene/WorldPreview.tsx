import { useMemo, useRef, type ComponentType } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { InstancedMesh, Mesh, type Group } from 'three'

import { HOME, POND_AT } from '../game/map'
import { FIRST_PAINT, MACHINE_KINDS, PAINTS, type MachineKind } from '../game/model'
import { createWorld } from '../game/world'
import { cutBowl, heightAt, rollOver, settle, spill, take } from '../game/terrain'
import { demoPose } from './demo'
import { Ground } from './Ground'
import { Scenery } from './Scenery'
import { Sky, StudioEnvironment } from './Sky'
import type { MachineProps } from './parts'

/**
 * `?world` shows the valley as the game does: the camera looks north from the south at 50
 * degrees. `&x=`, `&z=` is what it looks at, `&d=` the distance, `&day=` the time of day, `&tilt=` the angle in degrees (50).
 * `&dig` carves holes and spills heaps, `&roll` rolls half of the main road, `&churn` digs and
 * spills a little every frame to time the rebuilds, `&stats` writes `window.viewerStats`
 * (calls and triangles of the valley alone and of everything).
 */

type MachineComponent = ComponentType<MachineProps<MachineKind>>
const modules = import.meta.glob<Record<string, unknown>>('./machines/*.tsx', { eager: true })

function queryNumber(q: URLSearchParams, key: string, fallback: number): number {
  const raw = q.get(key)
  if (raw === null) return fallback
  const n = Number(raw)
  if (Number.isNaN(n)) throw new Error(`?${key}= must be a number, got "${raw}"`)
  return n
}

function Stats() {
  const scene = useThree((s) => s.scene)
  const last = useRef(0)
  useFrame((state) => {
    if (state.clock.elapsedTime - last.current < 1) return
    last.current = state.clock.elapsedTime
    const count = (skipMachines: boolean) => {
      let calls = 0
      let triangles = 0
      const each: string[] = []
      scene.traverseVisible((o) => {
        if (!(o instanceof Mesh)) return
        for (let p = o.parent; p !== null; p = p.parent) if (skipMachines && p.name === 'machines') return
        calls++
        const own = ((o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3) * (o instanceof InstancedMesh ? o.count : 1)
        triangles += own
        if (own > 4000) each.push(`${o.name}:${Math.round(own)}:${o instanceof InstancedMesh ? o.count : 0}`)
      })
      return { calls, triangles: Math.round(triangles), big: each }
    }
    const valley = count(true)
    const all = count(false)
    ;(window as unknown as { viewerStats: object }).viewerStats = { valley, all, render: { calls: state.gl.info.render.calls, triangles: state.gl.info.render.triangles } }
    document.title = `valley ${valley.calls} calls ${valley.triangles} tris`
  })
  return null
}

function Machines({ sim }: { sim: ReturnType<typeof createWorld> }) {
  const groups = useRef<Record<string, Group | null>>({})
  useFrame((state) => {
    for (const kind of MACHINE_KINDS) {
      const m = sim.machines[kind]
      demoPose(m, state.clock.elapsedTime)
      m.x = HOME[kind].x
      m.z = HOME[kind].z
      m.yaw = HOME[kind].yaw
      m.y = heightAt(sim.terrain, m.x, m.z)
      const g = groups.current[kind]
      if (g) {
        g.position.set(m.x, m.y, m.z)
        g.rotation.set(m.pitch, m.yaw, m.roll, 'YXZ')
      }
    }
  })
  return (
    <group name="machines">
      {MACHINE_KINDS.map((kind) => {
        const name = kind[0].toUpperCase() + kind.slice(1)
        const Machine = modules[`./machines/${name}.tsx`]?.[name] as MachineComponent | undefined
        if (!Machine) return null
        const paint = PAINTS.find((p) => p.id === FIRST_PAINT[kind])!.colour
        return (
          <group key={kind} ref={(g) => void (groups.current[kind] = g)}>
            <Machine m={sim.machines[kind]} paint={paint} driver={{ species: 'bear', hat: '#ffd23f' }} />
          </group>
        )
      })}
    </group>
  )
}

/** The game's camera: looking north, tilted, `d` metres from (x, z). */
function Rig({ x, z, d, tilt }: { x: number; z: number; d: number; tilt: number }) {
  const camera = useThree((s) => s.camera)
  useMemo(() => {
    camera.position.set(x, Math.sin(tilt) * d, z + Math.cos(tilt) * d)
    camera.lookAt(x, 0, z)
  }, [camera, x, z, d, tilt])
  return null
}

export function Preview() {
  const q = new URLSearchParams(window.location.search)
  const x = queryNumber(q, 'x', 0)
  const z = queryNumber(q, 'z', 0)
  const d = queryNumber(q, 'd', 120)
  const day = queryNumber(q, 'day', 0.3)
  const tilt = (queryNumber(q, 'tilt', 50) * Math.PI) / 180
  const sim = useMemo(() => {
    const s = createWorld({ storyDone: 0, moreDone: 0, coins: 0, stars: 0, mode: 'easy', seed: 1 })
    const t = s.terrain
    if (q.has('dig')) {
      take(t, -21, 8, 3, 40)
      take(t, -26, 14, 2.5, 20)
      take(t, -30, -20, 3, 18)
      spill(t, -10, 14, 2.5, 12, 'rock')
      spill(t, 4, 20, 3, 14, 'sand')
      spill(t, 12, 28, 2, 6, 'gravel')
      spill(t, -30, 40, 2.5, 8, 'concrete')
      take(t, 20, 4, 3, 25)
      cutBowl(t, POND_AT.x, POND_AT.z, POND_AT.r, 1.2)
      s.ponds[0].shown = true
      s.ponds[0].water = 0.8
    }
    if (q.has('roll')) for (let a = -22; a <= 2; a += 0.3) for (let k = 0; k < 2; k++) rollOver(t, a, 30, 1, 0, ROAD_ROLL_WIDTH, 0.6)
    return s
  }, [])
  const shown = useRef({ day, targetX: x, targetZ: z })
  const churn = q.has('churn')
  return (
    <Canvas className="stage" shadows dpr={1} camera={{ fov: 32, near: 0.5, far: 700 }}>
      <Rig x={x} z={z} d={d} tilt={tilt} />
      <StudioEnvironment />
      <Sky aim={() => shown.current} shadow={1024} />
      <Ground terrain={sim.terrain} ponds={sim.ponds} />
      <Scenery terrain={sim.terrain} />
      <Machines sim={sim} />
      <Churn sim={sim} on={churn} settling={q.has('dig') || churn} />
      {q.has('stats') && <Stats />}
    </Canvas>
  )
}

const ROAD_ROLL_WIDTH = 6

/** Lets the dug ground slump as in the game, and with `on` digs and spills a little every frame. */
function Churn({ sim, on, settling }: { sim: ReturnType<typeof createWorld>; on: boolean; settling: boolean }) {
  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (on) {
      take(sim.terrain, -20 + Math.sin(t) * 10, 8 + Math.cos(t) * 8, 1.5, 0.6)
      spill(sim.terrain, -5 + Math.sin(t * 0.7) * 12, 14 + Math.cos(t * 0.7) * 6, 1.5, 0.6, 'sand')
    }
    if (settling) settle(sim.terrain, 300)
  })
  return null
}
