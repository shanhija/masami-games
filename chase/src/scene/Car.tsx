import { RoundedBox } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, type ReactNode, type RefObject } from 'react'
import { AdditiveBlending, ExtrudeGeometry, Group, MeshBasicMaterial, Object3D, PointLight, Shape, SpotLight } from 'three'

import { clamp01 } from '../game/math'
import { CAR_LEN, DIZZY_FOR, player, type Car as CarState, type Sim } from '../game/sim'
import { night } from './daylight'
import { TOON_GRADIENT, palette } from './look'
import { WormBody } from './Worm'

export const WHEEL_R = 0.45
const HALF = CAR_LEN / 2
const WIDTH = 1.7
const R = 0.16
/** Wheels straddle the body: their outer faces stand proud of it, the way a toy car's do. */
const WHEEL_Z = WIDTH / 2 + 0.05
const WHEEL_X = 1.15

/** The side profile, nose to +X: a trunk, a dip for the seat, a hood, rounded all round. Extruded across the width with a bevel. */
const bodyGeometry = (() => {
  const s = new Shape()
  s.moveTo(-HALF + R, 0.5)
  s.lineTo(HALF - R, 0.5)
  s.quadraticCurveTo(HALF, 0.5, HALF, 0.5 + R)
  s.lineTo(HALF, 1.25)
  s.quadraticCurveTo(HALF, 1.4, HALF - R, 1.4)
  s.lineTo(0.5, 1.4)
  s.quadraticCurveTo(0.35, 1.4, 0.3, 1.25)
  s.lineTo(0.25, 1.15)
  s.lineTo(-1.15, 1.15)
  s.lineTo(-1.2, 1.25)
  s.quadraticCurveTo(-1.25, 1.4, -1.4, 1.4)
  s.lineTo(-HALF + R, 1.4)
  s.quadraticCurveTo(-HALF, 1.4, -HALF, 1.4 - R)
  s.lineTo(-HALF, 0.5 + R)
  s.quadraticCurveTo(-HALF, 0.5, -HALF + R, 0.5)
  const g = new ExtrudeGeometry(s, { depth: WIDTH - 0.2, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.1, bevelOffset: 0, bevelSegments: 3 })
  g.translate(0, 0, -(WIDTH - 0.2) / 2)
  return g
})()

/** A five-point star in its own XY plane, radius `r`, for badges and the stars a crash brings out. */
export function starShape(r: number) {
  const s = new Shape()
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5
    const rr = i % 2 === 0 ? r : r * 0.45
    if (i === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr)
    else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
  }
  s.closePath()
  return s
}
const badgeGeometry = new ExtrudeGeometry(starShape(0.2), { depth: 0.05, bevelEnabled: false })

function Wheel({ x, z, spin }: { x: number; z: number; spin: (hub: Group) => void }) {
  return (
    <group position={[x, WHEEL_R, z]}>
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[WHEEL_R, WHEEL_R, 0.42, 20]} />
        <meshToonMaterial color={palette.tyre} gradientMap={TOON_GRADIENT} />
      </mesh>
      {/* The hub and its three spokes are what show the wheel turning. */}
      <group ref={(el) => el && spin(el)}>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, Math.sign(z) * 0.22]}>
          <cylinderGeometry args={[WHEEL_R * 0.55, WHEEL_R * 0.55, 0.04, 16]} />
          <meshToonMaterial color={palette.hub} gradientMap={TOON_GRADIENT} />
        </mesh>
        {[0, 1, 2].map((i) => (
          <mesh key={i} rotation={[0, 0, (i * Math.PI * 2) / 3]} position={[0, 0, Math.sign(z) * 0.245]}>
            <boxGeometry args={[0.06, WHEEL_R * 0.9, 0.02]} />
            <meshToonMaterial color={palette.tyre} gradientMap={TOON_GRADIENT} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

/** Four wheels; their hubs are collected into `into` for the owner to spin. */
function Wheels({ into }: { into: RefObject<Group[]> }) {
  return (
    <>
      {[-WHEEL_X, WHEEL_X].map((x) =>
        [-WHEEL_Z, WHEEL_Z].map((z) => (
          <Wheel
            key={`${x}${z}`}
            x={x}
            z={z}
            spin={(hub) => {
              if (!into.current.includes(hub)) into.current.push(hub)
            }}
          />
        )),
      )}
    </>
  )
}

/** A driver from the shoulders up, facing +X: head, eyes, and whatever the caller puts on the head. */
function Driver({ head, children }: { head: (g: Group) => void; children: ReactNode }) {
  return (
    <group position={[-0.55, 1.15, 0]}>
      <RoundedBox args={[0.5, 0.5, 0.62]} radius={0.1} smoothness={3} position={[0, 0.25, 0]}>
        <meshToonMaterial color={palette.policeDark} gradientMap={TOON_GRADIENT} />
      </RoundedBox>
      <group ref={(el) => el && head(el)} position={[0, 0.78, 0]}>
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
        {children}
      </group>
    </group>
  )
}

/** How far ahead of the bumper the beams reach, and how wide they get there. */
const BEAM_LEN = 8
const BEAM_R = 1.7

/**
 * Headlights that come on with the night: the two lamps' cones of light in the air, and
 * one spotlight from the bumper that actually lights the road and whatever stands on it
 * ahead, which is what makes an obstacle visible in the dark.
 */
function Headlights({ sim }: { sim: Sim }) {
  const beams = useRef<MeshBasicMaterial>(null!)
  const lamp = useRef<SpotLight>(null!)
  const target = useMemo(() => new Object3D(), [])
  useFrame(() => {
    const n = night(sim.time)
    beams.current.opacity = 0.16 * n
    lamp.current.intensity = 90 * n
  })
  return (
    <>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[HALF + BEAM_LEN / 2, 1.08 - 0.25, side * 0.55]} rotation={[0, 0, Math.PI / 2 - 0.08]}>
          <coneGeometry args={[BEAM_R, BEAM_LEN, 20, 1, true]} />
          <meshBasicMaterial ref={beams} color={palette.headlight} transparent opacity={0} depthWrite={false} blending={AdditiveBlending} />
        </mesh>
      ))}
      <spotLight ref={lamp} position={[HALF, 1.1, 0]} target={target} angle={0.55} penumbra={0.7} distance={22} decay={2} color={palette.headlight} intensity={0} />
      <primitive object={target} position={[HALF + BEAM_LEN, -0.6, 0]} />
    </>
  )
}

/**
 * The worm that got in: it rides on the seat back beside the driver, wriggling, until a
 * jump flings it out, when it sails back off the car and tumbles away. Only the player's
 * car ever has one; on the other car this draws nothing.
 */
function RidingWorm({ sim, car }: { sim: Sim; car: CarState }) {
  const root = useRef<Group>(null!)
  useFrame(() => {
    const g = root.current
    if (player(sim) !== car) {
      g.scale.setScalar(1e-4)
      return
    }
    if (sim.wormAt >= 0) {
      const since = sim.time - sim.wormAt
      // Climbs up from the bumper over the first moment, then sits.
      const up = Math.min(1, since / 0.4)
      g.position.set(-0.2 + 0.4 * (1 - up), 1.35 * up + 0.5 * (1 - up), 0.42)
      g.rotation.set(0, 0, 0)
      g.scale.setScalar(0.8)
      return
    }
    const t = sim.time - sim.wormOutAt
    if (sim.wormOutAt < 0 || t > 1.2) {
      g.scale.setScalar(1e-4)
      return
    }
    g.position.set(-0.2 - 7 * t, 1.35 + 5 * t - 9 * t * t, 0.42 + 1.5 * t)
    g.rotation.set(0, 0, -9 * t)
    g.scale.setScalar(0.8)
  })
  return (
    <group ref={root}>
      <WormBody sim={sim} lean={0.03} />
    </group>
  )
}

/** Body, wheels, lights, windshield, steering wheel: everything both cars share. The owner adds its driver and its trimmings. */
function CarBody({ sim, car, color, dark, children }: { sim: Sim; car: CarState; color: string; dark: string; children: ReactNode }) {
  const tail = useRef<MeshBasicMaterial>(null!)
  useFrame(() => {
    // Brake lights: dim red as a rule, bright when the player is on the brake.
    const braking = player(sim) === car && sim.phase === 'chase' && sim.throttle === -1
    tail.current.color.set(braking ? palette.lightRed : palette.tailDim)
  })
  return (
    <>
      <mesh geometry={bodyGeometry} castShadow>
        <meshToonMaterial color={color} gradientMap={TOON_GRADIENT} />
      </mesh>
      {/* Windshield: a slanted pane at the front of the seat well. */}
      <RoundedBox args={[0.06, 0.7, 1.3]} radius={0.03} smoothness={2} position={[0.42, 1.68, 0]} rotation={[0, 0, -0.35]}>
        <meshToonMaterial color={palette.glass} gradientMap={TOON_GRADIENT} transparent opacity={0.75} />
      </RoundedBox>
      <mesh position={[0.05, 1.5, 0]} rotation={[0, 0, -0.6]}>
        <torusGeometry args={[0.2, 0.04, 8, 20]} />
        <meshToonMaterial color={dark} gradientMap={TOON_GRADIENT} />
      </mesh>
      {[-1, 1].map((end) => (
        <RoundedBox key={end} args={[0.16, 0.28, 1.4]} radius={0.05} smoothness={2} position={[end * (HALF + 0.02), 0.72, 0]}>
          <meshToonMaterial color={dark} gradientMap={TOON_GRADIENT} />
        </RoundedBox>
      ))}
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[HALF + 0.03, 1.08, side * 0.55]}>
            <sphereGeometry args={[0.13, 12, 10]} />
            <meshBasicMaterial color={palette.sun} />
          </mesh>
          <mesh position={[-HALF - 0.03, 1.08, side * 0.55]}>
            <boxGeometry args={[0.06, 0.16, 0.28]} />
            <meshBasicMaterial ref={tail} color={palette.tailDim} />
          </mesh>
        </group>
      ))}
      <Headlights sim={sim} />
      <RidingWorm sim={sim} car={car} />
      {children}
    </>
  )
}

/**
 * The car's motion, shared by both: it sits at its sim position (police-local along X),
 * pitches with its vertical speed in the air, squashes for a moment as it lands, bobs
 * on the road, and hops on the spot while the robber is caught. Wheels turn with the
 * distance covered.
 */
function useCarMotion(sim: Sim, car: CarState, root: RefObject<Group>, wheels: RefObject<Group[]>, wobble: () => number) {
  useFrame(() => {
    const g = root.current
    const t = sim.time
    g.position.x = car.x - sim.police.x
    const sinceLanding = t - car.landedAt
    const squash = car.landedAt >= 0 && sinceLanding < 0.28 ? Math.sin((Math.PI * sinceLanding) / 0.28) : 0
    const hop = sim.phase === 'caught' ? 0.3 * Math.abs(Math.sin((t - sim.phaseAt) * 7)) : 0
    const bob = car.y === 0 && car.speed > 1 ? 0.03 * Math.sin(t * 28) : 0
    g.position.y = car.y + hop + bob
    g.scale.set(1 + 0.18 * squash, 1 - 0.28 * squash, 1)
    // Nose up rising, down falling; on the road the player's nose dips under the brake and lifts under the turbo.
    const mine = player(sim) === car && sim.phase === 'chase'
    const pedal = mine ? (sim.turboOn ? 0.05 : sim.throttle === -1 ? -0.07 : 0) : 0
    const pitch = car.y > 0 ? Math.max(-0.35, Math.min(0.35, car.vy * 0.035)) : pedal
    g.rotation.z = pitch + wobble()
    for (const w of wheels.current) w.rotation.z = -car.x / WHEEL_R
  })
}

export function PoliceCar({ sim }: { sim: Sim }) {
  const root = useRef<Group>(null!)
  const wheels = useRef<Group[]>([])
  const head = useRef<Group>(null!)
  const red = useRef<MeshBasicMaterial>(null!)
  const blue = useRef<MeshBasicMaterial>(null!)
  const glow = useRef<PointLight>(null!)
  const car = sim.police
  useCarMotion(sim, car, root, wheels, () => dizzyWobble(sim, car, head.current))
  useFrame(() => {
    // The light bar flashes only once the chase is on; before that it just sits there.
    // At night the flashes throw red and blue on the road around the car.
    const on = sim.phase !== 'ready'
    const beat = Math.floor(sim.time * 5) % 2 === 0
    red.current.color.set(on && beat ? palette.lightRed : '#6e1d1d')
    blue.current.color.set(on && !beat ? palette.lightBlue : '#1c3a6e')
    glow.current.color.set(beat ? palette.lightRed : palette.lightBlue)
    glow.current.intensity = on ? 40 * night(sim.time) : 0
  })
  return (
    <group ref={root}>
      <CarBody sim={sim} car={car} color={palette.police} dark={palette.policeDark}>
        {/* Blue band along both flanks, and the star on each door. */}
        <RoundedBox args={[3.2, 0.34, WIDTH + 0.02]} radius={0.06} smoothness={2} position={[0, 0.75, 0]}>
          <meshToonMaterial color={palette.policeBlue} gradientMap={TOON_GRADIENT} />
        </RoundedBox>
        {[-1, 1].map((side) => (
          <mesh key={side} geometry={badgeGeometry} position={[-0.2, 1.1, side * (WIDTH / 2 + 0.01) - (side > 0 ? 0 : 0.05)]}>
            <meshToonMaterial color={palette.badge} gradientMap={TOON_GRADIENT} />
          </mesh>
        ))}
        {/* Roll bar behind the driver carrying the lights. */}
        <RoundedBox args={[0.14, 1.0, 1.5]} radius={0.05} smoothness={2} position={[-1.1, 1.85, 0]}>
          <meshToonMaterial color={palette.policeDark} gradientMap={TOON_GRADIENT} />
        </RoundedBox>
        <RoundedBox args={[0.3, 0.12, 1.0]} radius={0.04} smoothness={2} position={[-1.1, 2.4, 0]}>
          <meshToonMaterial color={palette.policeDark} gradientMap={TOON_GRADIENT} />
        </RoundedBox>
        <mesh position={[-1.1, 2.58, -0.25]}>
          <boxGeometry args={[0.3, 0.26, 0.42]} />
          <meshBasicMaterial ref={red} />
        </mesh>
        <mesh position={[-1.1, 2.58, 0.25]}>
          <boxGeometry args={[0.3, 0.26, 0.42]} />
          <meshBasicMaterial ref={blue} />
        </mesh>
        <pointLight ref={glow} position={[-1.1, 2.9, 0]} distance={14} decay={2} intensity={0} />
        <Driver
          head={(g) => {
            head.current = g
          }}
        >
          <mesh position={[0, 0.24, 0]}>
            <cylinderGeometry args={[0.3, 0.34, 0.2, 20]} />
            <meshToonMaterial color={palette.cap} gradientMap={TOON_GRADIENT} />
          </mesh>
          <mesh position={[0.28, 0.18, 0]}>
            <boxGeometry args={[0.28, 0.05, 0.5]} />
            <meshToonMaterial color={palette.policeDark} gradientMap={TOON_GRADIENT} />
          </mesh>
          <mesh geometry={badgeGeometry} position={[0.3, 0.32, 0]} rotation={[0, Math.PI / 2, 0]} scale={0.45}>
            <meshToonMaterial color={palette.badge} gradientMap={TOON_GRADIENT} />
          </mesh>
        </Driver>
      </CarBody>
      <Wheels into={wheels} />
    </group>
  )
}

export function RobberCar({ sim }: { sim: Sim }) {
  const root = useRef<Group>(null!)
  const wheels = useRef<Group[]>([])
  const head = useRef<Group>(null!)
  const car = sim.robber
  useCarMotion(sim, car, root, wheels, () => {
    // The robber looks back over the trunk whenever the police car is in trouble, right behind, or the getaway is on.
    const slowed = sim.police.speed < 0.6 * sim.police.top
    const close = sim.robber.x - sim.police.x < 7
    const want = slowed || close || sim.phase === 'escape' ? -2.4 : 0
    head.current.rotation.y += (want - head.current.rotation.y) * 0.12
    return dizzyWobble(sim, car, head.current)
  })
  return (
    <group ref={root}>
      <CarBody sim={sim} car={car} color={palette.robber} dark={palette.robberDark}>
        {/* The loot: a sack in the trunk, tied at the top, a coin or two spilling out. */}
        <mesh position={[-1.35, 1.65, 0]} castShadow>
          <sphereGeometry args={[0.38, 18, 14]} />
          <meshToonMaterial color={palette.sack} gradientMap={TOON_GRADIENT} />
        </mesh>
        <mesh position={[-1.35, 2.05, 0]}>
          <cylinderGeometry args={[0.1, 0.16, 0.2, 10]} />
          <meshToonMaterial color={palette.sack} gradientMap={TOON_GRADIENT} />
        </mesh>
        <mesh position={[-1.55, 2.1, 0.12]} rotation={[0.3, 0, 0.4]}>
          <cylinderGeometry args={[0.12, 0.12, 0.04, 14]} />
          <meshToonMaterial color={palette.coin} gradientMap={TOON_GRADIENT} />
        </mesh>
        <Driver
          head={(g) => {
            head.current = g
          }}
        >
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
        </Driver>
      </CarBody>
      <Wheels into={wheels} />
    </group>
  )
}

/** Fraction of the dizzy spell still to go, 0 when the driver is clear-headed. A harder crash is a longer spell. */
export function dizziness(sim: Sim) {
  if (sim.crashedAt < 0) return 0
  return 1 - clamp01((sim.time - sim.crashedAt) / (DIZZY_FOR * sim.crashPower))
}

/** Dizzy after a crash: the whole car wobbles, and the driver's head rolls with it. Returns the body's roll. */
function dizzyWobble(sim: Sim, car: CarState, head: Group) {
  const dizzy = player(sim) === car ? dizziness(sim) : 0
  head.rotation.x = dizzy * 0.4 * Math.sin(sim.time * 14)
  head.rotation.z = dizzy * 0.25 * Math.sin(sim.time * 9)
  return dizzy * 0.08 * Math.sin(sim.time * 22)
}
