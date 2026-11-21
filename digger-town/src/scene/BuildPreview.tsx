import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer } from '@react-three/drei'
import { useMemo, type ReactNode } from 'react'
import { BackSide } from 'three'

import { LOTS, PLANTS } from '../game/map'
import { SPECIES, type Animal, type Sim } from '../game/model'
import { createWorld, spawnAnimal, spawnThing } from '../game/world'
import { cutBowl, levelShape } from '../game/terrain'
import { THING_KINDS, PLANT_IDS } from '../game/model'
import { Animals } from './Animals'
import { Builds } from './Builds'
import { Ground } from './Ground'
import { STUDIO, sunOf } from './look'
import { Plants } from './Plants'
import { Things } from './Things'

/**
 * `?builds` shows the town's buildings, plants, things and animals on the real ground.
 * `&placed=<n>` that many pieces of every build, all shown (default all); `&work` every plant working;
 * `&things` one of every thing kind; `&animals` a crowd in every mood; `&moved` someone lives in every house;
 * `&fill=<0..1>` the forms' concrete and `&hard` set it; `&day=<0..1>` the time of day; `&x= &z= &d=` the camera
 * (looking north, tilted 50 degrees, `d` metres from its target); `&t=<s>` freezes time at that second;
 * `&only=builds,plants,things,animals` draws just those; `&nofloor` leaves the ground out; `&stats` writes window.viewerStats.
 */

/** The level a dug lot's floor is stamped at. */
const FLOOR_Y = -0.3
const MOODS: readonly Animal['mood'][] = ['walk', 'idle', 'wave', 'cheer', 'lick', 'swim', 'slide']

function number(q: URLSearchParams, key: string, fallback: number): number {
  const raw = q.get(key)
  if (raw === null) return fallback
  const n = Number(raw)
  if (Number.isNaN(n)) throw new Error(`?${key}= must be a number, got "${raw}"`)
  return n
}

function setup(q: URLSearchParams, cx: number, cz: number): Sim {
  const sim = createWorld({ storyDone: 0, moreDone: 0, coins: 0, stars: 0, mode: 'easy', seed: 1 })
  sim.day = number(q, 'day', 0.3)
  const placed = number(q, 'placed', 99)
  for (const b of sim.builds) {
    b.shown = true
    b.placed = Math.min(placed, b.spots.length)
    b.placedAt = -10
  }
  const fill = number(q, 'fill', 0.6)
  for (const f of sim.forms) {
    f.shown = true
    f.fill = q.has('hard') ? 1 : fill
    f.hard = q.has('hard')
    f.setting = number(q, 'setting', 0)
    const lot = LOTS[f.lot]
    levelShape(sim.terrain, { kind: 'rect', x: lot.x, z: lot.z, w: lot.w, d: lot.d }, FLOOR_Y, 'hard')
  }
  for (const p of sim.ponds) {
    cutBowl(sim.terrain, p.x, p.z, p.r, 1)
    p.shown = true
    p.water = 0.8
  }
  if (q.has('things')) THING_KINDS.forEach((kind, i) => spawnThing(sim, kind, -24.5 + i * 7, 0))
  if (q.has('moved')) for (const b of sim.builds) if (b.owner !== null) spawnAnimal(sim, b.owner, b.x, b.z + 5).home = b.id
  if (q.has('animals')) {
    sim.animals.length = 0
    MOODS.forEach((mood, row) =>
      SPECIES.forEach((species, col) => {
        const a: Animal = spawnAnimal(sim, species, cx + (col - 5) * 1.7, cz + (row - 3) * 2.1)
        a.mood = mood
        a.t = col * 0.37
        a.yaw = mood === 'slide' ? Math.PI / 2 : 0
      }),
    )
  }
  return sim
}

/** Advances time, the working plants and the animals' clocks, or holds them at `?t=`. */
function Clock({ sim, work, frozen }: { sim: Sim; work: boolean; frozen: number | null }) {
  const home = useMemo(() => sim.animals.map((a) => ({ x: a.x, z: a.z })), [sim])
  useFrame((_, dt) => {
    const step = frozen === null ? Math.min(dt, 0.1) : 0
    sim.time = frozen ?? sim.time + step
    for (const id of PLANT_IDS) {
      const p = sim.plants[id]
      p.phase = work ? 'work' : 'idle'
      p.stored = work ? PLANTS[id].need * 0.7 : 0
      p.t = frozen ?? p.t + step
    }
    sim.watering = work
    sim.animals.forEach((a, i) => {
      a.t = frozen === null ? a.t + step : frozen + (i % 11) * 0.37
      if (a.mood === 'walk') {
        const phase = sim.time * 0.6 + i
        a.x = home[i].x + Math.sin(phase) * 2
        a.yaw = Math.cos(phase) > 0 ? Math.PI / 2 : -Math.PI / 2
      }
    })
  })
  return null
}

function Stats() {
  const gl = useThree((s) => s.gl)
  useFrame(() => {
    ;(window as unknown as { viewerStats: object }).viewerStats = { calls: gl.info.render.calls, triangles: gl.info.render.triangles }
  })
  return null
}

function Lights({ day, tx, tz, span }: { day: number; tx: number; tz: number; span: number }) {
  const sun = useMemo(() => sunOf(day), [day])
  const scene = useThree((s) => s.scene)
  return (
    <>
      <color attach="background" args={[`#${sun.skyHorizon.getHexString()}`]} />
      <hemisphereLight args={[sun.hemiSky, sun.hemiGround, sun.hemiIntensity]} />
      <directionalLight
        ref={(light) => {
          if (light === null) return
          light.target.position.set(tx, 0, tz)
          scene.add(light.target)
        }}
        color={sun.colour}
        intensity={sun.intensity}
        position={[tx + sun.dir[0] * 40, sun.dir[1] * 40, tz + sun.dir[2] * 40]}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-span}
        shadow-camera-right={span}
        shadow-camera-top={span}
        shadow-camera-bottom={-span}
        shadow-camera-near={1}
        shadow-camera-far={120}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      />
      <Environment frames={1} resolution={128} environmentIntensity={sun.env}>
        <mesh scale={50}>
          <sphereGeometry args={[1, 16, 12]} />
          <meshBasicMaterial color={STUDIO.dome.horizon} side={BackSide} />
        </mesh>
        {STUDIO.lights.map((l, i) => (
          <Lightformer key={i} form={l.form} intensity={l.intensity} color={l.color} position={l.position as unknown as [number, number, number]} scale={l.scale as unknown as [number, number, number]} rotation={l.rotation as unknown as [number, number, number]} />
        ))}
      </Environment>
    </>
  )
}

export function Preview(): ReactNode {
  const q = new URLSearchParams(window.location.search)
  const only = q.get('only')?.split(',') ?? ['builds', 'plants', 'things', 'animals']
  const cx = number(q, 'x', 0)
  const cz = number(q, 'z', 0)
  const d = number(q, 'd', 60)
  const TILT = (number(q, 'tilt', 50) * Math.PI) / 180
  const sim = useMemo(() => setup(q, cx, cz), [])
  const frozen = q.has('t') ? number(q, 't', 0) : null
  const stats = q.has('stats')
  return (
    <Canvas
      className="stage"
      shadows={!stats}
      dpr={1}
      camera={{ fov: 35, near: 0.5, far: 400, position: [cx, d * Math.sin(TILT), cz + d * Math.cos(TILT)] }}
      onCreated={({ camera }) => camera.lookAt(cx, 0, cz)}
    >
      <Lights day={sim.day} tx={cx} tz={cz} span={Math.min(60, d * 0.6)} />
      {!q.has('nofloor') && <Ground terrain={sim.terrain} ponds={sim.ponds} />}
      {only.includes('builds') && <Builds sim={sim} />}
      {only.includes('plants') && <Plants sim={sim} />}
      {only.includes('things') && <Things sim={sim} />}
      {only.includes('animals') && <Animals sim={sim} />}
      <Clock sim={sim} work={q.has('work')} frozen={frozen} />
      {stats && <Stats />}
    </Canvas>
  )
}
