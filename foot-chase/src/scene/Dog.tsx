import { RoundedBox } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { Group } from 'three'

import type { Dog, Sim } from '../game/sim'
import { TOON_GRADIENT, badgeGeometry, palette } from './look'
import { Synced } from './Synced'

/**
 * A dog, nose along +X, turned around to face the way it runs. A yard dog is brown and
 * sits at its spot; the police dog is black and tan in a blue vest. Charging, the legs
 * scissor; hanging on, it rears up on the runner's leg and paddles; resting, it sits and
 * wags.
 */
function DogModel({ sim, dog }: { sim: Sim; dog: Dog }) {
  const root = useRef<Group>(null!)
  const legs = useRef<Group[]>([])
  const tail = useRef<Group>(null!)
  const head = useRef<Group>(null!)
  useFrame(() => {
    const t = sim.time
    const g = root.current
    const latched = dog.state === 'latched'
    const r = latched ? sim[dog.on!] : null
    g.position.set(dog.x - sim.police.x, r ? r.y + 0.15 : 0, 0)
    g.rotation.y = dog.facing < 0 ? Math.PI : 0
    const running = dog.state === 'charge' || dog.state === 'home'
    g.rotation.z = latched ? 0.7 : dog.state === 'charge' ? -0.08 : 0
    const stride = latched ? t * 30 : dog.state === 'charge' ? t * 22 : t * 14
    legs.current.forEach((leg, i) => {
      if (running || latched) leg.rotation.z = 0.7 * Math.sin(stride + (i % 2) * Math.PI + (i < 2 ? 0 : 0.6))
      else leg.rotation.z = i < 2 ? -0.2 : 0.9
    })
    tail.current.rotation.y = 0.6 * Math.sin(t * (latched ? 25 : 12))
    head.current.rotation.z = latched ? 0.3 * Math.sin(t * 20) : 0
  })
  const police = dog.kind === 'police'
  const fur = police ? palette.policeDog : palette.dog
  const face = police ? palette.policeDogTan : palette.dogBelly
  return (
    <group ref={root}>
      <RoundedBox args={[0.9, 0.42, 0.36]} radius={0.12} smoothness={3} position={[0, 0.45, 0]} castShadow>
        <meshToonMaterial color={fur} gradientMap={TOON_GRADIENT} />
      </RoundedBox>
      {police ? (
        <>
          <RoundedBox args={[0.5, 0.46, 0.4]} radius={0.06} smoothness={2} position={[0.05, 0.47, 0]}>
            <meshToonMaterial color={palette.vest} gradientMap={TOON_GRADIENT} />
          </RoundedBox>
          <mesh geometry={badgeGeometry} position={[0.05, 0.5, 0.2]} scale={0.6}>
            <meshToonMaterial color={palette.badge} gradientMap={TOON_GRADIENT} />
          </mesh>
        </>
      ) : (
        <mesh position={[0.34, 0.55, 0]} rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[0.2, 0.04, 8, 16]} />
          <meshToonMaterial color={palette.collar} gradientMap={TOON_GRADIENT} />
        </mesh>
      )}
      <group ref={head} position={[0.5, 0.66, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[0.26, 16, 12]} />
          <meshToonMaterial color={fur} gradientMap={TOON_GRADIENT} />
        </mesh>
        <RoundedBox args={[0.24, 0.16, 0.2]} radius={0.05} smoothness={2} position={[0.2, -0.07, 0]}>
          <meshToonMaterial color={face} gradientMap={TOON_GRADIENT} />
        </RoundedBox>
        <mesh position={[0.32, -0.05, 0]}>
          <sphereGeometry args={[0.06, 8, 6]} />
          <meshBasicMaterial color={palette.pupil} />
        </mesh>
        {[-1, 1].map((side) => (
          <group key={side}>
            <mesh position={[0.14, 0.1, side * 0.12]}>
              <sphereGeometry args={[0.06, 8, 6]} />
              <meshBasicMaterial color={palette.eye} />
            </mesh>
            <mesh position={[0.19, 0.1, side * 0.12]}>
              <sphereGeometry args={[0.03, 6, 5]} />
              <meshBasicMaterial color={palette.pupil} />
            </mesh>
            <mesh position={[-0.08, 0.18, side * 0.2]} rotation={[side * 0.5, 0, -0.4]}>
              <boxGeometry args={[0.16, 0.26, 0.06]} />
              <meshToonMaterial color={police ? palette.policeDog : palette.dogDark} gradientMap={TOON_GRADIENT} />
            </mesh>
          </group>
        ))}
      </group>
      <group ref={tail} position={[-0.45, 0.6, 0]}>
        <mesh position={[-0.18, 0.1, 0]} rotation={[0, 0, 0.7]}>
          <boxGeometry args={[0.42, 0.08, 0.08]} />
          <meshToonMaterial color={fur} gradientMap={TOON_GRADIENT} />
        </mesh>
      </group>
      {[-0.3, 0.3].map((x) =>
        [-0.14, 0.14].map((z) => (
          <group
            key={`${x}${z}`}
            position={[x, 0.32, z]}
            ref={(el) => {
              if (el && !legs.current.includes(el)) legs.current.push(el)
            }}
          >
            <mesh position={[0, -0.16, 0]} castShadow>
              <boxGeometry args={[0.12, 0.34, 0.12]} />
              <meshToonMaterial color={fur} gradientMap={TOON_GRADIENT} />
            </mesh>
            <mesh position={[0.02, -0.33, 0]}>
              <boxGeometry args={[0.16, 0.08, 0.13]} />
              <meshToonMaterial color={face} gradientMap={TOON_GRADIENT} />
            </mesh>
          </group>
        )),
      )}
    </group>
  )
}

export function Dogs({ sim }: { sim: Sim }) {
  return <Synced list={() => sim.dogs} render={(d) => <DogModel key={d.id} sim={sim} dog={d} />} />
}
