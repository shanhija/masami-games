import { PerspectiveCamera } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import { Vector3, type PerspectiveCamera as PerspectiveCameraObject } from 'three'

import { useGeneration, type Game } from '../game/game'
import { ROLES, SHAKE_FOR, type Sim } from '../game/sim'
import { Dogs } from './Dog'
import { Bursts, DizzyStars } from './Effects'
import { palette } from './look'
import { Lots } from './Lots'
import { Police, Robber } from './Runner'
import { Town } from './Town'

const FOV = 36
/** The picture always shows at least this much street on either side of the pair, and this much height. */
const SIDE_MARGIN = 6.5
const MIN_HALF_WIDTH = 11
const MIN_HALF_HEIGHT = 5.6
/** The camera stands above the path, looking down a little more than by day, so the street and the yards show in depth. */
const LOOK_AT_Y = 1.6
const ELEVATION = 0.3

/**
 * Frames both runners: centred between them, backing off as the gap grows and closing in
 * as the police gains, with a smoothed move so a catch does not snap. A crash shakes it.
 */
function CameraRig({ sim }: { sim: Sim }) {
  const camera = useRef<PerspectiveCameraObject>(null!)
  const size = useThree((s) => s.size)
  const at = useRef(new Vector3(7, 8, 40))
  const target = useRef(new Vector3())
  useFrame((_, delta) => {
    const gap = sim.robber.x - sim.police.x
    const aspect = size.width / size.height
    const tan = Math.tan((FOV * Math.PI) / 360)
    const halfW = Math.max(gap / 2 + SIDE_MARGIN, MIN_HALF_WIDTH)
    const dist = Math.max(halfW / (tan * aspect), MIN_HALF_HEIGHT / tan)
    const cx = gap / 2 + 0.5
    const k = 1 - Math.exp(-Math.min(delta, 0.1) / 0.35)
    at.current.x += (cx - at.current.x) * k
    at.current.z += (dist - at.current.z) * k
    const c = camera.current
    c.position.set(at.current.x, LOOK_AT_Y + at.current.z * ELEVATION, at.current.z)
    target.current.set(at.current.x, LOOK_AT_Y, 0)
    c.lookAt(target.current)
    // The shake: whichever runner crashed last and hardest; longer and harder the faster the crash.
    for (const role of ROLES) {
      const r = sim[role]
      const since = sim.time - r.crashedAt
      const shakeFor = SHAKE_FOR * r.crashPower
      if (r.crashedAt < 0 || since >= shakeFor) continue
      const amp = 0.5 * r.crashPower * (1 - since / shakeFor)
      c.position.x += amp * Math.sin(since * 71)
      c.position.y += amp * 0.7 * Math.cos(since * 53)
      c.rotateZ(amp * 0.04 * Math.sin(since * 61))
    }
  })
  return <PerspectiveCamera ref={camera} makeDefault fov={FOV} near={1} far={400} position={[7, 10, 40]} />
}

/**
 * Golden hour: a bluish fill, the orange sky's hemisphere, and a warm key from a sun low
 * on the left, so every shadow is long. A warm haze fades the far town into the sky.
 */
function Sunlight() {
  return (
    <>
      <fog attach="fog" args={[palette.horizon, 55, 135]} />
      <ambientLight color="#9aa8ff" intensity={0.5} />
      <hemisphereLight args={[palette.skyMid, palette.grassDark, 0.5]} />
      <directionalLight
        color="#ffc38a"
        position={[-16, 9, 14]}
        intensity={1.7}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0005}
        shadow-normalBias={0.1}
        shadow-camera-left={-16}
        shadow-camera-right={44}
        shadow-camera-top={14}
        shadow-camera-bottom={-8}
        shadow-camera-near={1}
        shadow-camera-far={70}
      />
    </>
  )
}

/** Advances the game once per frame, before anything reads it: the negative priority sorts it first. */
function Driver({ game }: { game: Game }) {
  useFrame((_, delta) => {
    game.advance(Math.min(delta, 0.05)) // a tab switch must not leap the chase forward
  }, -1)
  return null
}

/** Everything that moves. Keyed by the restart count in Stage, so a restart mounts it afresh: no stale star or confetti survives. */
function Scene({ sim }: { sim: Sim }) {
  return (
    <>
      <Town sim={sim} />
      <Lots sim={sim} />
      <Dogs sim={sim} />
      <Police sim={sim} />
      <Robber sim={sim} />
      <DizzyStars sim={sim} />
      <Bursts sim={sim} />
    </>
  )
}

export function Stage({ game }: { game: Game }) {
  const sim = game.sim
  const generation = useGeneration(game)
  return (
    <div className="stage">
      <Canvas shadows dpr={[1, 1.5]} gl={{ powerPreference: 'high-performance', antialias: true }}>
        <color attach="background" args={[palette.horizon]} />
        <Driver game={game} />
        <CameraRig sim={sim} />
        <Sunlight />
        <Scene key={generation} sim={sim} />
      </Canvas>
    </div>
  )
}
