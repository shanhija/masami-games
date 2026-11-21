import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'

import type { Species } from '../game/model'
import { creature } from './creatures'
import { SOLID_MESH } from './parts'

/** A little under the standing toy, so the head and hat stay below a cab roof 1.3 above the seat. */
const SCALE = 0.9
/** The body's base sits this far below the creature's origin. */
const BASE = 0.25

/**
 * The child's own builder, sitting in a cab: body, big head and hard hat, legs out in front and
 * hands forward on the levers, looking ahead (+z). Its origin is the seat point (`SEAT` in
 * model.ts), the base of its body. It sways a little. One draw call (the geometry is shared).
 */
export function Driver({ species, hat }: { species: Species; hat: string }) {
  const ref = useRef<Group>(null)
  const c = creature(species, hat, true)
  useFrame((state) => {
    const t = state.clock.elapsedTime
    const g = ref.current!
    g.rotation.z = Math.sin(t * 1.7) * 0.025
    g.rotation.y = Math.sin(t * 0.9) * 0.05
    g.position.y = Math.sin(t * 3.1) * 0.006
  })
  return (
    <group ref={ref}>
      <mesh geometry={c.body} material={SOLID_MESH} position={[0, -BASE * SCALE, 0]} scale={SCALE} />
    </group>
  )
}
