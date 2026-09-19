import { PerspectiveCamera } from '@react-three/drei'
import { Canvas, events as pointerEvents, useFrame, useThree, type RootStore } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Color, Vector3, type DirectionalLight, type HemisphereLight, type Intersection, type Object3D, type PerspectiveCamera as PerspectiveCameraObject } from 'three'

import { useGeneration, type Game } from '../game/game'
import { clamp01, ease, smoothstep } from '../game/math'
import { ORBIT_FOR, chosenPiece, type Sim } from '../game/sim'
import { Castle } from './Castle'
import { Effects } from './Effects'
import { Island } from './Island'
import { CAMERA_FOV, CAMERA_HALF_FOV, CAMERA_PITCH, CAMERA_YAW, FRAME_R, GROUND_AHEAD, daylight, palette } from './look'
import { Nodes } from './Nodes'
import { People } from './People'
import { Sky } from './Sky'

const TWO_PI = Math.PI * 2
const DAY = new Color(palette.skyHorizon)
const NIGHT = new Color(palette.nightHorizon)
const STORM = new Color(palette.stormHorizon)
const SUN = new Color(palette.sunlight)
const SUN_NIGHT = new Color(palette.moonlight)

/** How grey the storm has made things, 0 to 1: up over the first 3 s of the warning, gone over the first 3 s of the rainbow. */
function stormRamp(s: Sim) {
  const since = s.time - s.weatherAt
  switch (s.weather) {
    case 'warning':
      return clamp01(since / 3)
    case 'thunder':
    case 'wind':
      return 1
    case 'rainbow':
      return 1 - clamp01(since / 3)
    case 'clear':
      return 0
  }
}

/** Whether a thing and everything it hangs from is on screen. */
function inSight(o: Object3D) {
  for (let node: Object3D | null = o; node; node = node.parent) if (!node.visible) return false
  return true
}

/**
 * A finger finds only what the child can see: three's raycaster pays no attention to
 * `visible`, so a piece's hidden halves (the fire it is not on, the stones it has not
 * lost, the turrets a wall grows only when it stands alone) would catch taps meant for
 * the meadow beside them.
 */
const seenEvents = (store: RootStore) => ({ ...pointerEvents(store), filter: (hits: Intersection[]) => hits.filter((hit) => inSight(hit.object)) })

/** Advances the game once per frame, before anything reads it: the negative priority sorts it first. */
function Driver({ game }: { game: Game }) {
  useFrame((_, delta) => game.advance(Math.min(delta, 0.05)), -1)
  return null
}

/** The sky behind everything: the day horizon, bluer in the evening, grey while the storm is about. */
function Backdrop({ sim }: { sim: Sim }) {
  const bg = useRef<Color>(null!)
  useFrame(() => {
    bg.current.lerpColors(DAY, NIGHT, daylight(sim).night).lerp(STORM, stormRamp(sim))
  })
  return <color ref={bg} attach="background" args={[palette.skyHorizon]} />
}

/**
 * A fixed diorama frame that always keeps FRAME_R of ground in view around the aim, in
 * front of it and to each side, so the whole grid and the roofs on it stay on screen;
 * the camera stands further back on a narrow screen to manage that. The aim
 * leans a little toward the hero while the child plays around the castle, less while a
 * piece is chosen, and follows properly once they run out into the meadow, so the hero
 * is never far in front of it. An orbit sweeps the yaw one full turn with ease in and
 * out, carrying on from wherever it is if another orbit starts mid-turn, and settles
 * back to the diorama angle after. A bolt or a landing piece gives it a small nudge.
 */
function CameraRig({ sim, aim }: { sim: Sim; aim: Vector3 }) {
  const camera = useRef<PerspectiveCameraObject>(null!)
  const size = useThree((s) => s.size)
  const orbit = useRef({ prev: 0, spin: 0, zoom: 1 })
  useFrame((_, delta) => {
    const t = sim.time
    const dt = Math.min(delta, 0.1)
    // A piece in hand leans less, so the grid the ghost is hopping over holds still.
    const lean = chosenPiece(sim) !== null ? 0.15 : 0.25
    // Near the castle the aim only leans, so the grid holds still. Further out it follows
    // enough to keep the hero within 18 units of the aim, which is as far in front of it
    // as the hero can stand and still sit above the build bar.
    const r = Math.hypot(sim.hero.x, sim.hero.z)
    const follow = Math.max(lean, 1 - 18 / Math.max(r, 1))
    aim.x = ease(aim.x, sim.hero.x * follow, dt, 0.5)
    aim.z = ease(aim.z, sim.hero.z * follow, dt, 0.5)
    const o = orbit.current
    const orbiting = t < sim.orbitUntil
    if (orbiting) {
      const sweep = smoothstep(0, 1, (t - (sim.orbitUntil - ORBIT_FOR)) / ORBIT_FOR)
      if (sweep < o.prev) o.prev = 0
      o.spin += (sweep - o.prev) * TWO_PI
      o.prev = sweep
    } else {
      o.prev = 0
      o.spin = ease(o.spin, Math.round(o.spin / TWO_PI) * TWO_PI, dt, 0.5)
    }
    o.zoom = ease(o.zoom, orbiting ? 1.15 : 1, dt, 0.5)
    const yaw = CAMERA_YAW + o.spin
    const aspect = size.width / size.height
    const d = FRAME_R * Math.max(1 / GROUND_AHEAD, 1 / (Math.tan(CAMERA_HALF_FOV) * aspect)) * o.zoom
    const c = camera.current
    c.position.set(aim.x + Math.sin(yaw) * Math.cos(CAMERA_PITCH) * d, Math.sin(CAMERA_PITCH) * d, aim.z + Math.cos(yaw) * Math.cos(CAMERA_PITCH) * d)
    c.lookAt(aim)
    const nudge = t - sim.lightning.at < 0.12 ? 0.15 : sim.pieces.some((p) => t - p.builtAt < 0.15) ? 0.1 : 0
    if (nudge > 0) {
      c.position.x += nudge * Math.sin(t * 97)
      c.position.y += nudge * Math.cos(t * 83)
    }
  })
  return <PerspectiveCamera ref={camera} makeDefault fov={CAMERA_FOV} near={1} far={300} />
}

/**
 * One warm sun with soft shadows and a hemisphere fill, no ambient. The sun follows the
 * camera's aim so its shadow box always covers what is on screen, dims and goes grey
 * with the storm, cools in the evening; the fill flares for a tenth of a second on a bolt.
 */
function Lights({ sim, aim }: { sim: Sim; aim: Vector3 }) {
  const sun = useRef<DirectionalLight>(null!)
  const fill = useRef<HemisphereLight>(null!)
  useFrame(() => {
    const { night, light } = daylight(sim)
    const s = sun.current
    s.position.set(aim.x - 40, 60, aim.z + 34)
    s.target.position.set(aim.x, 0, aim.z)
    s.target.updateMatrixWorld()
    s.intensity = 2.2 * light * (1 - 0.4 * stormRamp(sim))
    s.color.lerpColors(SUN, SUN_NIGHT, night)
    fill.current.intensity = sim.time - sim.lightning.at < 0.1 ? 6 : 0.8 - 0.25 * night
  })
  return (
    <>
      <directionalLight
        ref={sun}
        color={palette.sunlight}
        position={[-40, 60, 34]}
        intensity={2.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.06}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
        shadow-camera-near={1}
        shadow-camera-far={200}
      />
      <hemisphereLight ref={fill} args={[palette.skyLight, palette.groundLight, 0.8]} />
    </>
  )
}

/** The world. Keyed by the castle count in Stage, so a new castle mounts it afresh with no stale effect left over. */
function Scene({ sim, game }: { sim: Sim; game: Game }) {
  return (
    <>
      <Sky sim={sim} />
      <Island sim={sim} game={game} />
      <Nodes sim={sim} game={game} />
      <Castle sim={sim} game={game} />
      <People sim={sim} />
      <Effects sim={sim} />
    </>
  )
}

export function Stage({ game }: { game: Game }) {
  const sim = game.sim
  const generation = useGeneration(game)
  // Where the camera looks; the sun's shadow box follows it.
  const aim = useMemo(() => new Vector3(), [])
  return (
    <div className="stage">
      <Canvas shadows dpr={[1, 1.5]} events={seenEvents} gl={{ antialias: true, powerPreference: 'high-performance' }}>
        <Backdrop sim={sim} />
        <Driver game={game} />
        <CameraRig sim={sim} aim={aim} />
        <Lights sim={sim} aim={aim} />
        <Scene key={generation} sim={sim} game={game} />
      </Canvas>
    </div>
  )
}
