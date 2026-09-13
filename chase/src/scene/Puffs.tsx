import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { InstancedMesh, MeshToonMaterial, Object3D } from 'three'

import type { Car, Sim } from '../game/sim'
import { CAR_LEN, player } from '../game/sim'
import { TOON_GRADIENT, palette } from './look'

const COUNT = 14
const EVERY = 0.09
const LIFE = 0.9
const scratch = new Object3D()

interface Puff {
  born: number
  /** World x: a puff stays where the tailpipe left it while the car drives on. */
  x: number
  y: number
  z: number
  /** 1 for a flame, puffed while the turbo pushed: bigger, and it does not last. */
  flame: number
}

/**
 * Exhaust: a puff every few frames off the back of a moving car, drifting up and
 * growing, then shrinking away. With the turbo on, the puffs are flames: orange, big and
 * quick. A fixed pool, so the oldest is reused. Lives in the scene root, not under the
 * car: a puff must not squash and pitch with it.
 */
export function Puffs({ sim, car, color }: { sim: Sim; car: Car; color: string }) {
  const mesh = useRef<InstancedMesh>(null!)
  const material = useRef<MeshToonMaterial>(null!)
  const pool = useRef<Puff[]>(Array.from({ length: COUNT }, () => ({ born: -Infinity, x: 0, y: 0, z: 0, flame: 0 })))
  const next = useRef(0)
  const lastBorn = useRef(-Infinity)

  useFrame(() => {
    const t = sim.time
    const flaming = sim.turboOn && player(sim) === car
    if (car.speed > 2.5 && car.y === 0 && t - lastBorn.current >= (flaming ? EVERY / 2 : EVERY)) {
      lastBorn.current = t
      const p = pool.current[next.current++ % COUNT]!
      p.born = t
      p.x = car.x - CAR_LEN / 2 - 0.2
      p.y = 0.75
      p.z = 0.45 + Math.sin(t * 13) * 0.2
      p.flame = flaming ? 1 : 0
    }
    // One material for the pool: it turns to flame with the newest puff, which is what the eye follows.
    const newest = pool.current[(next.current - 1 + COUNT) % COUNT]!
    material.current.color.set(newest.flame > 0 && t - newest.born < 0.3 ? palette.flame : color)
    for (let i = 0; i < COUNT; i++) {
      const p = pool.current[i]!
      const age = (t - p.born) / (p.flame > 0 ? LIFE * 0.5 : LIFE)
      if (age > 1) {
        scratch.scale.setScalar(1e-4)
      } else {
        const size = (0.16 + 0.55 * Math.sin(Math.PI * Math.min(1, age * 1.15))) * (1 + 0.6 * p.flame)
        scratch.scale.setScalar(size)
      }
      scratch.position.set(p.x - sim.police.x, p.y + Math.max(0, age) * 1.4, p.z)
      scratch.updateMatrix()
      mesh.current.setMatrixAt(i, scratch.matrix)
    }
    mesh.current.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, COUNT]} frustumCulled={false}>
      <sphereGeometry args={[1, 10, 8]} />
      <meshToonMaterial ref={material} color={color} gradientMap={TOON_GRADIENT} transparent opacity={0.85} />
    </instancedMesh>
  )
}
