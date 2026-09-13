import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { Color, ExtrudeGeometry, Group, InstancedMesh, Object3D } from 'three'

import { mulberry32 } from '../game/random'
import { player, type Sim } from '../game/sim'
import { dizziness, starShape } from './Car'
import { TOON_GRADIENT, palette } from './look'

const scratch = new Object3D()
const starGeometry = new ExtrudeGeometry(starShape(1), { depth: 0.3, bevelEnabled: false })

/** Three stars circling over the player's driver for as long as the crash lasts. */
export function DizzyStars({ sim }: { sim: Sim }) {
  const stars = useRef<Group[]>([])
  useFrame(() => {
    const d = dizziness(sim)
    const t = sim.time
    const me = player(sim)
    stars.current.forEach((s, i) => {
      const a = t * 6 + (i * Math.PI * 2) / 3
      s.position.set(me.x - sim.police.x - 0.55 + Math.cos(a) * 0.7, me.y + 2.85 + Math.sin(t * 3 + i) * 0.1, Math.sin(a) * 0.7)
      s.rotation.z = t * 4 + i
      s.scale.setScalar(Math.max(1e-4, 0.3 * d))
    })
  })
  return (
    <>
      {[0, 1, 2].map((i) => (
        <group key={i} ref={(el) => el && (stars.current[i] = el)}>
          <mesh geometry={starGeometry}>
            <meshBasicMaterial color={palette.star} />
          </mesh>
        </group>
      ))}
    </>
  )
}

interface Shot {
  at: number
  /** World x of the origin; y is height. */
  x: number
  y: number
}

/**
 * A burst of small bodies thrown from a point and falling under gravity, all worked out
 * from the time since the shot: nothing is integrated, so a burst costs the same on
 * every frame. `armed` says when a new burst starts and where; up to SHOTS run at once.
 */
function Burst({ sim, count, life, colors, size, spread, lift, armed }: {
  sim: Sim
  count: number
  life: number
  colors: readonly string[]
  size: number
  spread: number
  lift: number
  armed: () => Shot | null
}) {
  const SHOTS = 2
  const mesh = useRef<InstancedMesh>(null!)
  const shots = useRef<Shot[]>(Array.from({ length: SHOTS }, () => ({ at: -Infinity, x: 0, y: 0 })))
  const nextShot = useRef(0)
  const lastArmed = useRef(-Infinity)
  /** Each particle's throw, fixed for the burst's whole life. */
  const throws = useMemo(() => {
    const rand = mulberry32(777 + count)
    return Array.from({ length: SHOTS * count }, () => ({
      vx: (rand() - 0.5) * 2 * spread,
      vy: lift * (0.5 + rand() * 0.8),
      vz: (rand() - 0.5) * 2 * spread * 0.7,
      spin: (rand() - 0.5) * 20,
      scale: 0.6 + rand() * 0.8,
      color: Math.floor(rand() * colors.length),
    }))
  }, [count, spread, lift, colors])
  const tints = useMemo(() => colors.map((c) => new Color(c)), [colors])
  useLayoutEffect(() => {
    throws.forEach((p, i) => mesh.current.setColorAt(i, tints[p.color]!))
    mesh.current.instanceColor!.needsUpdate = true
  }, [throws, tints])

  useFrame(() => {
    const shot = armed()
    if (shot && shot.at !== lastArmed.current) {
      lastArmed.current = shot.at
      shots.current[nextShot.current++ % SHOTS] = shot
    }
    const t = sim.time
    for (let s = 0; s < SHOTS; s++) {
      const shot = shots.current[s]!
      const age = t - shot.at
      const alive = age >= 0 && age < life
      for (let i = 0; i < count; i++) {
        const p = throws[s * count + i]!
        if (!alive) {
          scratch.scale.setScalar(1e-4)
        } else {
          const fade = age > life * 0.7 ? 1 - (age - life * 0.7) / (life * 0.3) : 1
          scratch.position.set(shot.x - sim.police.x + p.vx * age, shot.y + p.vy * age - 6 * age * age, p.vz * age + 0.5)
          scratch.rotation.set(p.spin * age, p.spin * 0.7 * age, 0)
          scratch.scale.setScalar(size * p.scale * fade)
        }
        scratch.updateMatrix()
        mesh.current.setMatrixAt(s * count + i, scratch.matrix)
      }
    }
    mesh.current.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, SHOTS * count]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshToonMaterial color="#ffffff" gradientMap={TOON_GRADIENT} />
    </instancedMesh>
  )
}

/** Confetti over the robber car at a catch or an escape, whoever is celebrating; a puff of dust off the player's nose at a crash. */
export function Bursts({ sim }: { sim: Sim }) {
  return (
    <>
      <Burst
        sim={sim}
        count={48}
        life={2.2}
        colors={palette.confetti}
        size={0.22}
        spread={5}
        lift={9}
        armed={() => (sim.phase === 'caught' || sim.phase === 'escaped' ? { at: sim.phaseAt, x: sim.robber.x - 1.8, y: 2.2 } : null)}
      />
      <Burst
        sim={sim}
        count={16}
        life={0.9}
        colors={[palette.dust, palette.smoke]}
        size={0.4}
        spread={3}
        lift={4}
        armed={() => (sim.crashedAt >= 0 ? { at: sim.crashedAt, x: player(sim).x + 1.6, y: 0.7 } : null)}
      />
    </>
  )
}
