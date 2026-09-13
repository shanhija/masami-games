import { PerspectiveCamera } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { AmbientLight, DirectionalLight, HemisphereLight, Vector3, type PerspectiveCamera as PerspectiveCameraObject } from 'three'

import { useGeneration, type Game } from '../game/game'
import { SHAKE_FOR, type Sim } from '../game/sim'
import { PoliceCar, RobberCar } from './Car'
import { daylight, lookAt, newLook } from './daylight'
import { Bursts, DizzyStars } from './Effects'
import { palette } from './look'
import { Obstacles } from './Obstacles'
import { Puffs } from './Puffs'
import { World } from './World'

const FOV = 36
/** The picture always shows at least this much road on either side of the pair, and this much height. */
const SIDE_MARGIN = 7.5
const MIN_HALF_WIDTH = 11
const MIN_HALF_HEIGHT = 5.8
/** The camera stands a little above the road, looking slightly down, so the road surface shows. */
const LOOK_AT_Y = 2.2
const ELEVATION = 0.2

/**
 * Frames both cars: centred between them, backing off as the gap grows and closing in as
 * the police car gains, with a smoothed move so a catch does not snap. A crash shakes it.
 */
function CameraRig({ sim }: { sim: Sim }) {
  const camera = useRef<PerspectiveCameraObject>(null!)
  const size = useThree((s) => s.size)
  const at = useRef(new Vector3(9, 8, 40))
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
    // The shake: harder and longer the faster the crash.
    const since = sim.time - sim.crashedAt
    const shakeFor = SHAKE_FOR * sim.crashPower
    if (sim.crashedAt >= 0 && since < shakeFor) {
      const amp = 0.6 * sim.crashPower * (1 - since / shakeFor)
      c.position.x += amp * Math.sin(since * 71)
      c.position.y += amp * 0.7 * Math.cos(since * 53)
      c.rotateZ(amp * 0.04 * Math.sin(since * 61))
    }
  })
  return <PerspectiveCamera ref={camera} makeDefault fov={FOV} near={1} far={400} position={[9, 10, 40]} />
}

/**
 * The lights, turning with the day: a weak fill, the sky's hemisphere, and the key from
 * the sun, which dims to a blue moonlight at night. The key's direction stays put, so
 * the shadow camera never has to move; only its strength and colour follow the sun.
 */
function Daylight({ sim }: { sim: Sim }) {
  const ambient = useRef<AmbientLight>(null!)
  const hemi = useRef<HemisphereLight>(null!)
  const key = useRef<DirectionalLight>(null!)
  const look = useMemo(newLook, [])
  useFrame(() => {
    const d = daylight(sim.time)
    lookAt(d, look)
    ambient.current.intensity = 0.12 + 0.48 * d
    hemi.current.intensity = 0.15 + 0.35 * d
    hemi.current.color.copy(look.skyTop)
    key.current.intensity = 0.3 + 1.3 * d
    key.current.color.copy(look.sun)
  })
  return (
    <>
      <ambientLight ref={ambient} intensity={0.6} />
      <hemisphereLight ref={hemi} args={[palette.sky, palette.grassDark, 0.5]} />
      <directionalLight
        ref={key}
        position={[-10, 18, 14]}
        intensity={1.6}
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

/** Everything that moves. Keyed by the restart count in Stage, so a restart mounts it afresh: no stale puff, star or confetti survives. */
function Scene({ sim }: { sim: Sim }) {
  return (
    <>
      <World sim={sim} />
      <Obstacles sim={sim} />
      <PoliceCar sim={sim} />
      <RobberCar sim={sim} />
      <Puffs sim={sim} car={sim.police} color={palette.smoke} />
      <Puffs sim={sim} car={sim.robber} color={palette.smoke} />
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
        <color attach="background" args={[palette.sky]} />
        <Driver game={game} />
        <CameraRig sim={sim} />
        <Daylight sim={sim} />
        <Scene key={generation} sim={sim} />
      </Canvas>
    </div>
  )
}
