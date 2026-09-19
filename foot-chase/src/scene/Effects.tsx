import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { Color, ExtrudeGeometry, Group, InstancedMesh, Object3D } from 'three'

import { mulberry32 } from '../game/random'
import { BOX_H, ROLES, type Box, type House, type Role, type Sim } from '../game/sim'
import { TOON_GRADIENT, palette, starShape } from './look'
import { dizziness } from './Runner'

const scratch = new Object3D()
const starGeometry = new ExtrudeGeometry(starShape(1), { depth: 0.3, bevelEnabled: false })

/** Three stars circling over a runner's head for as long as the crash lasts; one set per runner. */
export function DizzyStars({ sim }: { sim: Sim }) {
  const stars = useRef<Record<Role, Group[]>>({ police: [], robber: [] })
  useFrame(() => {
    const t = sim.time
    for (const role of ROLES) {
      const r = sim[role]
      const d = dizziness(r, t)
      stars.current[role].forEach((s, i) => {
        const a = t * 6 + (i * Math.PI * 2) / 3
        s.position.set(r.x - sim.police.x + Math.cos(a) * 0.6, r.y + 2.7 + Math.sin(t * 3 + i) * 0.1, Math.sin(a) * 0.6)
        s.rotation.z = t * 4 + i
        s.scale.setScalar(Math.max(1e-4, 0.28 * d))
      })
    }
  })
  return (
    <>
      {ROLES.map((role) =>
        [0, 1, 2].map((i) => (
          <group key={`${role}${i}`} ref={(el) => el && (stars.current[role][i] = el)}>
            <mesh geometry={starGeometry}>
              <meshBasicMaterial color={palette.star} />
            </mesh>
          </group>
        )),
      )}
    </>
  )
}

interface Shot {
  at: number
  /** World x of the origin; y is height, z is toward the camera. */
  x: number
  y: number
  z: number
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
  const shots = useRef<Shot[]>(Array.from({ length: SHOTS }, () => ({ at: -Infinity, x: 0, y: 0, z: 0 })))
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
          scratch.position.set(shot.x - sim.police.x + p.vx * age, shot.y + p.vy * age - 6 * age * age, shot.z + p.vz * age + 0.5)
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

const COIN = [palette.coin] as const
const DUST = [palette.dust, palette.smoke] as const

/**
 * Confetti over the robber at a catch or an escape; the loot spilling at a catch; a puff
 * of dust off a runner at a crash; sparkles out of a crate as it opens; coins off the
 * porch as the robber grabs the bag.
 */
export function Bursts({ sim }: { sim: Sim }) {
  return (
    <>
      <Burst sim={sim} count={48} life={2.2} colors={palette.confetti} size={0.22} spread={5} lift={9} armed={() => (sim.phase === 'caught' || sim.phase === 'escaped' ? { at: sim.phaseAt, x: sim.robber.x - 1, y: 2.4, z: 0 } : null)} />
      <Burst sim={sim} count={12} life={1.8} colors={COIN} size={0.3} spread={4} lift={7} armed={() => (sim.droppedAt >= 0 && sim.droppedCoins > 0 ? { at: sim.droppedAt, x: sim.robber.x, y: 1.8, z: 0 } : null)} />
      {ROLES.map((role) => (
        <Burst key={role} sim={sim} count={16} life={0.9} colors={DUST} size={0.4} spread={3} lift={4} armed={() => (sim[role].crashedAt >= 0 ? { at: sim[role].crashedAt, x: sim[role].x + 0.8, y: 0.5, z: 0 } : null)} />
      ))}
      <Burst
        sim={sim}
        count={20}
        life={1.2}
        colors={palette.sparkle}
        size={0.18}
        spread={4}
        lift={6}
        armed={() => {
          let latest: Box | null = null
          for (const b of sim.boxes) if (b.opened && (latest === null || b.hitAt > latest.hitAt)) latest = b
          return latest ? { at: latest.hitAt, x: latest.x, y: BOX_H, z: 0 } : null
        }}
      />
      <Burst
        sim={sim}
        count={8}
        life={1.2}
        colors={COIN}
        size={0.2}
        spread={2.5}
        lift={5}
        armed={() => {
          let latest: House | null = null
          for (const h of sim.houses) if (h.takenAt >= 0 && (latest === null || h.takenAt > latest.takenAt)) latest = h
          return latest ? { at: latest.takenAt, x: latest.x, y: 0.8, z: -2.5 } : null
        }}
      />
    </>
  )
}
