import { useFrame } from '@react-three/fiber'
import { useRef, useState, type ComponentType } from 'react'
import { Group } from 'three'

import type { Obstacle, Sim } from '../game/sim'
import { TOON_GRADIENT, palette } from './look'
import { WormBody } from './Worm'

/**
 * Every obstacle stands about OBSTACLE_H tall over a footprint about OBSTACLE_HALF wide:
 * the sim's box. Knocked, it flies forward and toward the camera, tumbling, and falls
 * out of the picture; the sim drops it once it is well behind the police car.
 */
function Rock() {
  return (
    <group>
      <mesh position={[0, 0.55, 0]} rotation={[0.2, 0.4, 0]} castShadow>
        <dodecahedronGeometry args={[0.75, 0]} />
        <meshToonMaterial color={palette.rock} gradientMap={TOON_GRADIENT} />
      </mesh>
      <mesh position={[0.45, 0.28, 0.5]} rotation={[0.5, 0.2, 0.3]} castShadow>
        <dodecahedronGeometry args={[0.3, 0]} />
        <meshToonMaterial color={palette.rockDark} gradientMap={TOON_GRADIENT} />
      </mesh>
    </group>
  )
}

function Log() {
  return (
    <group>
      <mesh position={[0, 0.5, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.5, 0.5, 2.6, 14]} />
        <meshToonMaterial color={palette.log} gradientMap={TOON_GRADIENT} />
      </mesh>
      {[-1, 1].map((end) => (
        <mesh key={end} position={[0, 0.5, end * 1.31]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.42, 0.42, 0.02, 14]} />
          <meshToonMaterial color={palette.logEnd} gradientMap={TOON_GRADIENT} />
        </mesh>
      ))}
      <mesh position={[0.3, 0.98, 0.4]} castShadow>
        <sphereGeometry args={[0.14, 8, 6]} />
        <meshToonMaterial color={palette.logEnd} gradientMap={TOON_GRADIENT} />
      </mesh>
    </group>
  )
}

function Cake() {
  return (
    <group>
      <mesh position={[0, 0.3, 0]} castShadow>
        <cylinderGeometry args={[0.72, 0.72, 0.6, 20]} />
        <meshToonMaterial color={palette.cake} gradientMap={TOON_GRADIENT} />
      </mesh>
      <mesh position={[0, 0.62, 0]}>
        <cylinderGeometry args={[0.74, 0.74, 0.08, 20]} />
        <meshToonMaterial color={palette.cream} gradientMap={TOON_GRADIENT} />
      </mesh>
      <mesh position={[0, 0.88, 0]} castShadow>
        <cylinderGeometry args={[0.45, 0.45, 0.45, 20]} />
        <meshToonMaterial color={palette.cake} gradientMap={TOON_GRADIENT} />
      </mesh>
      <mesh position={[0, 1.12, 0]}>
        <cylinderGeometry args={[0.47, 0.47, 0.07, 20]} />
        <meshToonMaterial color={palette.cream} gradientMap={TOON_GRADIENT} />
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} position={[Math.cos((i * Math.PI * 2) / 5) * 0.58, 0.72, Math.sin((i * Math.PI * 2) / 5) * 0.58]}>
          <sphereGeometry args={[0.1, 8, 6]} />
          <meshToonMaterial color={palette.cherry} gradientMap={TOON_GRADIENT} />
        </mesh>
      ))}
      <mesh position={[0, 1.3, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.3, 8]} />
        <meshToonMaterial color={palette.candle} gradientMap={TOON_GRADIENT} />
      </mesh>
      <mesh position={[0, 1.5, 0]}>
        <sphereGeometry args={[0.08, 8, 6]} />
        <meshBasicMaterial color={palette.flame} />
      </mesh>
    </group>
  )
}

function Barrel() {
  return (
    <group>
      <mesh position={[0, 0.6, 0]} castShadow>
        <cylinderGeometry args={[0.55, 0.55, 1.2, 16]} />
        <meshToonMaterial color={palette.barrel} gradientMap={TOON_GRADIENT} />
      </mesh>
      {[0.25, 0.95].map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <cylinderGeometry args={[0.58, 0.58, 0.1, 16]} />
          <meshToonMaterial color={palette.barrelBand} gradientMap={TOON_GRADIENT} />
        </mesh>
      ))}
    </group>
  )
}

/** A worm standing up out of the road, wiggling, leaning toward whoever is coming. */
function Worm({ sim }: { sim: Sim }) {
  return <WormBody sim={sim} lean={-0.14} />
}

const MODELS: Record<Obstacle['kind'], ComponentType<{ sim: Sim }>> = { rock: Rock, log: Log, cake: Cake, barrel: Barrel, worm: Worm }

function Standing({ sim, obstacle }: { sim: Sim; obstacle: Obstacle }) {
  const root = useRef<Group>(null!)
  const Model = MODELS[obstacle.kind]
  useFrame(() => {
    const g = root.current
    const x = obstacle.x - sim.police.x
    if (obstacle.hitAt < 0) {
      g.position.set(x, 0, 0)
      g.rotation.set(0, 0, 0)
      g.scale.setScalar(1)
      return
    }
    // A worm that was hit is in the car now, not on the road. Anything else is knocked: a lob
    // forward and out toward the camera, spinning, through the ground and gone.
    if (obstacle.kind === 'worm') {
      g.scale.setScalar(1e-4)
      return
    }
    const t = sim.time - obstacle.hitAt
    g.position.set(x + 7 * t, 7 * t - 9 * t * t, 3.5 * t)
    g.rotation.set(0.5 * t, 0, -7 * t)
  })
  return (
    <group ref={root}>
      <Model sim={sim} />
    </group>
  )
}

/**
 * One component per obstacle in the sim, keyed by id, so a knocked one keeps its own
 * flight. The sim adds and drops obstacles without telling React, so the list is
 * re-read every frame and re-rendered only when it has changed. A new obstacle shows
 * up a frame late, well off the right edge.
 */
export function Obstacles({ sim }: { sim: Sim }) {
  const [shown, setShown] = useState<Obstacle[]>([])
  useFrame(() => {
    const live = sim.obstacles
    if (live.length !== shown.length || live.some((o, i) => o !== shown[i])) setShown([...live])
  })
  return (
    <>
      {shown.map((o) => (
        <Standing key={o.id} sim={sim} obstacle={o} />
      ))}
    </>
  )
}
