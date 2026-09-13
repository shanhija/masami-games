import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { Group } from 'three'

import type { Sim } from '../game/sim'
import { TOON_GRADIENT, palette } from './look'

const SEGMENTS = 5
const SEG = 0.2

/**
 * A worm: a stack of pink balls that sways, the top one wearing the face. `lean` tips the
 * stack along X per segment, so a worm on the road reaches toward the car coming at it.
 * The whole stack bunches and stretches like an inchworm, which is what sells the crawl.
 * Wherever it is put, its base sits on the group's origin.
 */
export function WormBody({ sim, lean }: { sim: Sim; lean: number }) {
  const segments = useRef<Group[]>([])
  const body = useRef<Group>(null!)
  useFrame(() => {
    const t = sim.time
    const pulse = Math.sin(t * 9)
    body.current.scale.set(1 + 0.12 * pulse, 1 - 0.1 * pulse, 1 + 0.12 * pulse)
    segments.current.forEach((g, i) => {
      g.position.set(lean * i + 0.09 * i * Math.sin(t * 7 + i * 0.8), 0.18 + i * SEG, 0.04 * i * Math.sin(t * 5 + i))
    })
  })
  return (
    <group ref={body}>
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <group
          key={i}
          ref={(el) => {
            if (el) segments.current[i] = el
          }}
        >
          <mesh castShadow>
            <sphereGeometry args={[i === SEGMENTS - 1 ? 0.26 : 0.2 + i * 0.01, 14, 10]} />
            <meshToonMaterial color={i % 2 === 0 ? palette.worm : palette.wormBelly} gradientMap={TOON_GRADIENT} />
          </mesh>
          {i === SEGMENTS - 1 &&
            [-1, 1].map((side) => (
              <group key={side} position={[-0.17, 0.06, side * 0.1]}>
                <mesh>
                  <sphereGeometry args={[0.08, 10, 8]} />
                  <meshBasicMaterial color={palette.eye} />
                </mesh>
                <mesh position={[-0.05, 0, 0]}>
                  <sphereGeometry args={[0.04, 8, 6]} />
                  <meshBasicMaterial color={palette.pupil} />
                </mesh>
              </group>
            ))}
        </group>
      ))}
    </group>
  )
}
