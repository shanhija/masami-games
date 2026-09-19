import { RoundedBox } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef, type ReactNode } from 'react'
import { Group } from 'three'

import { clamp01 } from '../game/math'
import { DIZZY_FOR, flying, type Role, type Runner as RunnerState, type Sim } from '../game/sim'
import { TOON_GRADIENT, badgeGeometry, palette, show } from './look'

/** Fraction of the dizzy spell still to go, 0 when the runner is clear-headed. A harder crash is a longer spell. */
export function dizziness(r: RunnerState, time: number) {
  if (r.crashedAt < 0) return 0
  return 1 - clamp01((time - r.crashedAt) / (DIZZY_FOR * r.crashPower))
}

/**
 * A runner, facing +X: legs and arms hung from their pivots, a torso, a head with eyes,
 * and whatever the owner adds to the head, the feet, the front hand and the body. All the
 * motion is here, shared: it stands at its sim position (police-local along X), runs with
 * scissoring limbs, spreads them in the air, trails them under the propeller, glides on
 * skates, throws its hands up when told to stop, squashes on landing, wobbles when dizzy,
 * and hops on the spot when caught.
 */
function Person({ sim, role, shirt, pants, head: headWear, foot, held, children }: { sim: Sim; role: Role; shirt: string; pants: string; head: ReactNode; foot: (i: number) => ReactNode; held: ReactNode; children: ReactNode }) {
  const r = sim[role]
  const root = useRef<Group>(null!)
  const head = useRef<Group>(null!)
  const legs = useRef<Group[]>([])
  const arms = useRef<Group[]>([])
  useFrame(() => {
    const t = sim.time
    const g = root.current
    g.position.x = r.x - sim.police.x
    const sinceLanding = t - r.landedAt
    const squash = r.landedAt >= 0 && sinceLanding < 0.25 ? Math.sin((Math.PI * sinceLanding) / 0.25) : 0
    const hop = sim.phase === 'caught' && role === 'robber' ? 0.25 * Math.abs(Math.sin((t - sim.phaseAt) * 8)) : 0
    const stride = r.x * 1.9
    const swing = Math.sin(stride)
    const inAir = !r.onGround
    const flyingNow = flying(r, t)
    const frozen = role === 'robber' && t < r.frozenUntil && r.onGround
    const skating = role === 'police' && t < r.skatesUntil && r.onGround
    const running = r.onGround && r.speed > 0.5 && !skating && !frozen
    const bob = running ? 0.04 * Math.abs(swing) : 0
    g.position.y = r.y + hop + bob
    g.scale.set(1 + 0.15 * squash, 1 - 0.22 * squash, 1)
    const dizzy = dizziness(r, t)
    // Lean into the run, more with speed; nose down and up with the vertical speed in the air; the dizzy wobble on top.
    const lean = flyingNow ? -0.35 : r.onGround ? -0.1 * (r.speed / r.top) : Math.max(-0.25, Math.min(0.25, -r.vy * 0.02))
    g.rotation.z = lean + dizzy * 0.08 * Math.sin(t * 22) + (frozen ? 0.02 * Math.sin(t * 40) : 0)
    legs.current.forEach((leg, i) => {
      const sign = i === 0 ? 1 : -1
      leg.rotation.z = flyingNow ? -0.9 + 0.15 * Math.sin(t * 6 + i) : inAir ? sign * 0.6 : skating ? (i === 0 ? 0.25 : -0.45) : running ? 0.75 * swing * sign : 0
    })
    arms.current.forEach((arm, i) => {
      const sign = i === 0 ? -1 : 1
      arm.rotation.z = frozen
        ? Math.PI - 0.25 + 0.05 * Math.sin(t * 40 + i)
        : flyingNow
          ? -1.2
          : inAir
            ? 1.4
            : sim.phase === 'caught' && role === 'police'
              ? 1.3
              : running
                ? 0.7 * swing * sign
                : 0.1
    })
    // The head rolls when dizzy; the robber looks back when the police is close or the getaway is on.
    const h = head.current
    h.rotation.x = dizzy * 0.4 * Math.sin(t * 14)
    h.rotation.z = dizzy * 0.25 * Math.sin(t * 9)
    const lookBack = role === 'robber' && (sim.robber.x - sim.police.x < 7 || sim.phase === 'escape') ? -2.4 : 0
    h.rotation.y += (lookBack - h.rotation.y) * 0.12
  })
  return (
    <group ref={root}>
      {[-1, 1].map((side, i) => (
        <group
          key={side}
          position={[0, 0.95, side * 0.15]}
          ref={(el) => {
            if (el) legs.current[i] = el
          }}
        >
          <RoundedBox args={[0.24, 0.85, 0.24]} radius={0.06} smoothness={2} position={[0, -0.42, 0]} castShadow>
            <meshToonMaterial color={pants} gradientMap={TOON_GRADIENT} />
          </RoundedBox>
          <RoundedBox args={[0.42, 0.18, 0.26]} radius={0.06} smoothness={2} position={[0.07, -0.87, 0]} castShadow>
            <meshToonMaterial color={palette.boot} gradientMap={TOON_GRADIENT} />
          </RoundedBox>
          {foot(i)}
        </group>
      ))}
      <RoundedBox args={[0.6, 0.75, 0.52]} radius={0.1} smoothness={3} position={[0, 1.33, 0]} castShadow>
        <meshToonMaterial color={shirt} gradientMap={TOON_GRADIENT} />
      </RoundedBox>
      {[-1, 1].map((side, i) => (
        <group
          key={side}
          position={[0, 1.62, side * 0.36]}
          ref={(el) => {
            if (el) arms.current[i] = el
          }}
        >
          <RoundedBox args={[0.18, 0.62, 0.18]} radius={0.05} smoothness={2} position={[0, -0.3, 0]} castShadow>
            <meshToonMaterial color={shirt} gradientMap={TOON_GRADIENT} />
          </RoundedBox>
          <mesh position={[0, -0.66, 0]}>
            <sphereGeometry args={[0.11, 10, 8]} />
            <meshToonMaterial color={palette.skin} gradientMap={TOON_GRADIENT} />
          </mesh>
          {i === 1 && held}
        </group>
      ))}
      <group ref={head} position={[0, 1.98, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[0.32, 20, 16]} />
          <meshToonMaterial color={palette.skin} gradientMap={TOON_GRADIENT} />
        </mesh>
        {[-1, 1].map((side) => (
          <group key={side} position={[0.24, 0.04, side * 0.12]}>
            <mesh>
              <sphereGeometry args={[0.09, 12, 10]} />
              <meshToonMaterial color={palette.eye} gradientMap={TOON_GRADIENT} />
            </mesh>
            <mesh position={[0.06, 0, 0]}>
              <sphereGeometry args={[0.045, 10, 8]} />
              <meshBasicMaterial color={palette.pupil} />
            </mesh>
          </group>
        ))}
        {headWear}
      </group>
      {children}
    </group>
  )
}

/** The officer: blue uniform, cap and badge. Wears the skates, blows the whistle and holds up the magnet while those last. */
export function Police({ sim }: { sim: Sim }) {
  const whistle = useRef<Group>(null!)
  const magnet = useRef<Group>(null!)
  const skates = useRef<Group[]>([])
  useFrame(() => {
    const t = sim.time
    show(whistle.current, t < sim.robber.frozenUntil)
    show(magnet.current, t < sim.robber.draggedUntil)
    for (const s of skates.current) show(s, t < sim.police.skatesUntil)
  })
  return (
    <Person
      sim={sim}
      role="police"
      shirt={palette.police}
      pants={palette.policeDark}
      head={
        <>
          <mesh position={[0, 0.24, 0]}>
            <cylinderGeometry args={[0.3, 0.34, 0.2, 20]} />
            <meshToonMaterial color={palette.police} gradientMap={TOON_GRADIENT} />
          </mesh>
          <mesh position={[0.28, 0.18, 0]}>
            <boxGeometry args={[0.28, 0.05, 0.5]} />
            <meshToonMaterial color={palette.policeDark} gradientMap={TOON_GRADIENT} />
          </mesh>
          <mesh geometry={badgeGeometry} position={[0.3, 0.32, 0]} rotation={[0, Math.PI / 2, 0]} scale={0.45}>
            <meshToonMaterial color={palette.badge} gradientMap={TOON_GRADIENT} />
          </mesh>
          <group ref={whistle} position={[0.38, -0.08, 0]}>
            <mesh rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.04, 0.04, 0.18, 8]} />
              <meshToonMaterial color={palette.whistle} gradientMap={TOON_GRADIENT} />
            </mesh>
            <mesh position={[0.1, -0.03, 0]}>
              <sphereGeometry args={[0.07, 10, 8]} />
              <meshToonMaterial color={palette.whistle} gradientMap={TOON_GRADIENT} />
            </mesh>
          </group>
        </>
      }
      foot={(i) => (
        <group
          position={[0.07, -1.0, 0]}
          ref={(el) => {
            if (el) skates.current[i] = el
          }}
        >
          {[-0.13, 0.13].map((x) => (
            <mesh key={x} position={[x, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.07, 0.07, 0.3, 10]} />
              <meshToonMaterial color={palette.skate} gradientMap={TOON_GRADIENT} />
            </mesh>
          ))}
        </group>
      )}
      held={
        <group ref={magnet} position={[0.12, -0.7, 0.08]} rotation={[0, 0, -Math.PI / 2]}>
          {[-0.16, 0.16].map((z) => (
            <group key={z}>
              <mesh position={[0, 0.16, z]}>
                <boxGeometry args={[0.12, 0.32, 0.12]} />
                <meshToonMaterial color={palette.magnet} gradientMap={TOON_GRADIENT} />
              </mesh>
              <mesh position={[0, 0.36, z]}>
                <boxGeometry args={[0.12, 0.08, 0.12]} />
                <meshToonMaterial color={palette.magnetTip} gradientMap={TOON_GRADIENT} />
              </mesh>
            </group>
          ))}
          <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.16, 0.06, 8, 12, Math.PI]} />
            <meshToonMaterial color={palette.magnet} gradientMap={TOON_GRADIENT} />
          </mesh>
        </group>
      }
    >
      <mesh geometry={badgeGeometry} position={[0.31, 1.45, 0.12]} rotation={[0, Math.PI / 2, 0]} scale={0.5}>
        <meshToonMaterial color={palette.badge} gradientMap={TOON_GRADIENT} />
      </mesh>
    </Person>
  )
}

/** The robber: striped shirt, beanie, mask, and the loot sack on its back, fatter the more it carries. Wears the propeller pack, the springs and the bone while those last. */
export function Robber({ sim }: { sim: Sim }) {
  const sack = useRef<Group>(null!)
  const pack = useRef<Group>(null!)
  const blades = useRef<Group>(null!)
  const bone = useRef<Group>(null!)
  const springs = useRef<Group[]>([])
  useFrame(() => {
    const t = sim.time
    const r = sim.robber
    sack.current.scale.setScalar(0.7 + 0.04 * Math.min(sim.coins, 12))
    const fly = flying(r, t)
    show(pack.current, fly)
    blades.current.rotation.y = t * 40
    show(bone.current, t < r.boneUntil)
    for (const s of springs.current) show(s, t < r.springsUntil)
  })
  return (
    <Person
      sim={sim}
      role="robber"
      shirt={palette.robberShirt}
      pants={palette.robberPants}
      head={
        <>
          <mesh position={[0.2, 0.06, 0]}>
            <boxGeometry args={[0.28, 0.16, 0.5]} />
            <meshToonMaterial color={palette.mask} gradientMap={TOON_GRADIENT} />
          </mesh>
          <mesh position={[0, 0.22, 0]}>
            <sphereGeometry args={[0.31, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshToonMaterial color={palette.beanie} gradientMap={TOON_GRADIENT} />
          </mesh>
          <mesh position={[0, 0.26, 0]}>
            <cylinderGeometry args={[0.33, 0.33, 0.1, 20]} />
            <meshToonMaterial color={palette.beanie} gradientMap={TOON_GRADIENT} />
          </mesh>
        </>
      }
      foot={(i) => (
        <group
          position={[0.07, -0.98, 0]}
          ref={(el) => {
            if (el) springs.current[i] = el
          }}
        >
          {[0, 0.08, 0.16].map((y) => (
            <mesh key={y} position={[0, -y, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.13, 0.03, 6, 14]} />
              <meshToonMaterial color={palette.spring} gradientMap={TOON_GRADIENT} />
            </mesh>
          ))}
        </group>
      )}
      held={
        <group ref={bone} position={[0.1, -0.7, 0.08]} rotation={[0, 0, 0.5]}>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.05, 0.05, 0.4, 8]} />
            <meshToonMaterial color={palette.bone} gradientMap={TOON_GRADIENT} />
          </mesh>
          {[-0.2, 0.2].map((x) =>
            [-0.05, 0.05].map((z) => (
              <mesh key={`${x}${z}`} position={[x, 0, z]}>
                <sphereGeometry args={[0.08, 8, 6]} />
                <meshToonMaterial color={palette.bone} gradientMap={TOON_GRADIENT} />
              </mesh>
            )),
          )}
        </group>
      }
    >
      {[1.15, 1.33, 1.51].map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <boxGeometry args={[0.62, 0.09, 0.54]} />
          <meshToonMaterial color={palette.robberStripe} gradientMap={TOON_GRADIENT} />
        </mesh>
      ))}
      <group ref={sack} position={[-0.45, 1.3, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[0.4, 18, 14]} />
          <meshToonMaterial color={palette.sack} gradientMap={TOON_GRADIENT} />
        </mesh>
        <mesh position={[0, 0.42, 0]}>
          <cylinderGeometry args={[0.1, 0.16, 0.2, 10]} />
          <meshToonMaterial color={palette.sack} gradientMap={TOON_GRADIENT} />
        </mesh>
      </group>
      {/* The propeller pack: a box on the back, a mast up past the head, two blades whirling on top. */}
      <group ref={pack} position={[-0.42, 1.55, 0]}>
        <RoundedBox args={[0.32, 0.6, 0.46]} radius={0.06} smoothness={2} castShadow>
          <meshToonMaterial color={palette.pack} gradientMap={TOON_GRADIENT} />
        </RoundedBox>
        <mesh position={[0, 0.65, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 0.9, 8]} />
          <meshToonMaterial color={palette.propeller} gradientMap={TOON_GRADIENT} />
        </mesh>
        <group ref={blades} position={[0, 1.1, 0]}>
          {[0, 1].map((i) => (
            <mesh key={i} rotation={[0, (i * Math.PI) / 2, 0]}>
              <boxGeometry args={[1.3, 0.04, 0.14]} />
              <meshToonMaterial color={palette.propeller} gradientMap={TOON_GRADIENT} />
            </mesh>
          ))}
        </group>
      </group>
    </Person>
  )
}
