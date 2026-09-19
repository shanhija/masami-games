import { RoundedBox } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { ExtrudeGeometry, Group, Shape } from 'three'

import { BOX_H, CAR_FAR, CAR_HALF_L, CAR_HALF_W, CAR_NEAR, FENCE_H, LANE, ROAD_HALF_W, type Banana, type Box, type Fence, type House, type Road, type RoadCar, type Sim } from '../game/sim'
import { TOON_GRADIENT, badgeGeometry, palette } from './look'
import { Synced } from './Synced'
import { GRASS_TOP, PATH_HALF_W } from './Town'

const HOUSE_W = 6
const HOUSE_H = 4.2
const HOUSE_D = 5
/** The front wall stands this far behind the path; the porch reaches from it toward the path. */
const HOUSE_FRONT = -3.4
const HOUSE_Z = HOUSE_FRONT - HOUSE_D / 2
const PORCH_D = 1.8
const PORCH_Z = HOUSE_FRONT + PORCH_D / 2

/** The roof: a triangle extruded along the house, a little wider than the walls, ridge along X. */
const roofGeometry = (() => {
  const s = new Shape()
  const half = (HOUSE_D + 1) / 2
  s.moveTo(-half, 0)
  s.lineTo(half, 0)
  s.lineTo(0, 2.2)
  s.closePath()
  return new ExtrudeGeometry(s, { depth: HOUSE_W + 0.8, bevelEnabled: false })
})()

/** Knocked things fly the same way: a lob forward and out toward the camera, spinning, through the ground and gone. */
function fling(g: Group, x: number, t: number) {
  g.position.set(x + 6 * t, 6 * t - 9 * t * t, 3.5 * t)
  g.rotation.set(0.5 * t, 0, -6 * t)
}

/** A house behind the path, its door facing it, the money bag on the porch until the robber takes it. */
function HouseModel({ sim, house }: { sim: Sim; house: House }) {
  const root = useRef<Group>(null!)
  const bag = useRef<Group>(null!)
  useFrame(() => {
    root.current.position.x = house.x - sim.police.x
    const gone = house.takenAt >= 0
    bag.current.scale.setScalar(gone ? 1e-4 : 1)
    bag.current.rotation.z = 0.06 * Math.sin(sim.time * 3 + house.id)
  })
  const wall = palette.wall[house.style]!
  const roof = palette.roof[house.style]!
  return (
    <group ref={root}>
      <mesh position={[0, GRASS_TOP + HOUSE_H / 2, HOUSE_Z]} castShadow receiveShadow>
        <boxGeometry args={[HOUSE_W, HOUSE_H, HOUSE_D]} />
        <meshToonMaterial color={wall} gradientMap={TOON_GRADIENT} />
      </mesh>
      <mesh geometry={roofGeometry} position={[-(HOUSE_W + 0.8) / 2, GRASS_TOP + HOUSE_H, HOUSE_Z]} rotation={[0, Math.PI / 2, 0]} castShadow>
        <meshToonMaterial color={roof} gradientMap={TOON_GRADIENT} />
      </mesh>
      <mesh position={[1.8, GRASS_TOP + HOUSE_H + 1.3, HOUSE_Z - 0.8]} castShadow>
        <boxGeometry args={[0.6, 1.2, 0.6]} />
        <meshToonMaterial color={palette.chimney} gradientMap={TOON_GRADIENT} />
      </mesh>
      <mesh position={[0, GRASS_TOP + 1.05, HOUSE_FRONT + 0.06]}>
        <boxGeometry args={[1.2, 2.1, 0.12]} />
        <meshToonMaterial color={palette.door} gradientMap={TOON_GRADIENT} />
      </mesh>
      <mesh position={[0.4, GRASS_TOP + 1.05, HOUSE_FRONT + 0.14]}>
        <sphereGeometry args={[0.07, 8, 6]} />
        <meshToonMaterial color={palette.lid} gradientMap={TOON_GRADIENT} />
      </mesh>
      {/* The windows are lit: it is evening, and everyone is home. */}
      {[-1.9, 1.9].map((x) => (
        <group key={x} position={[x, GRASS_TOP + 2.6, HOUSE_FRONT + 0.06]}>
          <mesh>
            <boxGeometry args={[1.2, 1.2, 0.1]} />
            <meshToonMaterial color={palette.frame} gradientMap={TOON_GRADIENT} />
          </mesh>
          <mesh position={[0, 0, 0.04]}>
            <boxGeometry args={[1.0, 1.0, 0.06]} />
            <meshBasicMaterial color={palette.windowLit} />
          </mesh>
          <mesh position={[0, 0, 0.08]}>
            <boxGeometry args={[0.08, 1.0, 0.02]} />
            <meshToonMaterial color={palette.frame} gradientMap={TOON_GRADIENT} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, GRASS_TOP + 2.4, HOUSE_FRONT + 0.16]}>
        <sphereGeometry args={[0.12, 8, 6]} />
        <meshBasicMaterial color={palette.lampGlow} />
      </mesh>
      <mesh position={[0, GRASS_TOP + 0.15, PORCH_Z]} receiveShadow>
        <boxGeometry args={[2.6, 0.3, PORCH_D]} />
        <meshToonMaterial color={palette.porch} gradientMap={TOON_GRADIENT} />
      </mesh>
      {/* The loot: a tied sack with a coin on top, sitting on the porch step. */}
      <group ref={bag} position={[0, GRASS_TOP + 0.3, PORCH_Z]}>
        <mesh position={[0, 0.4, 0]} scale={[1, 1.1, 1]} castShadow>
          <sphereGeometry args={[0.4, 18, 14]} />
          <meshToonMaterial color={palette.sack} gradientMap={TOON_GRADIENT} />
        </mesh>
        <mesh position={[0, 0.86, 0]}>
          <cylinderGeometry args={[0.1, 0.17, 0.2, 10]} />
          <meshToonMaterial color={palette.sack} gradientMap={TOON_GRADIENT} />
        </mesh>
        <mesh position={[0.16, 0.98, 0.1]} rotation={[0.3, 0, 0.5]}>
          <cylinderGeometry args={[0.14, 0.14, 0.04, 14]} />
          <meshToonMaterial color={palette.coin} gradientMap={TOON_GRADIENT} />
        </mesh>
      </group>
    </group>
  )
}

const FENCE_Z0 = -6.5
const FENCE_Z1 = 2.6
const POSTS = Array.from({ length: 10 }, (_, i) => FENCE_Z0 + i * ((FENCE_Z1 - FENCE_Z0) / 9))

/** A white picket fence across the path at the end of a yard; smashed, it flies off in one piece. */
function FenceModel({ sim, fence }: { sim: Sim; fence: Fence }) {
  const root = useRef<Group>(null!)
  useFrame(() => {
    const g = root.current
    const x = fence.x - sim.police.x
    if (fence.hitAt < 0) {
      g.position.set(x, 0, 0)
      g.rotation.set(0, 0, 0)
    } else {
      fling(g, x, sim.time - fence.hitAt)
    }
  })
  return (
    <group ref={root}>
      {POSTS.map((z) => (
        <group key={z} position={[0, GRASS_TOP, z]}>
          <mesh position={[0, (FENCE_H + 0.1) / 2, 0]} castShadow>
            <boxGeometry args={[0.12, FENCE_H + 0.1, 0.14]} />
            <meshToonMaterial color={palette.fence} gradientMap={TOON_GRADIENT} />
          </mesh>
          <mesh position={[0, FENCE_H + 0.18, 0]} rotation={[0, Math.PI / 4, 0]}>
            <coneGeometry args={[0.11, 0.16, 4]} />
            <meshToonMaterial color={palette.fence} gradientMap={TOON_GRADIENT} />
          </mesh>
        </group>
      ))}
      {[0.4, 0.8].map((y) => (
        <mesh key={y} position={[0, GRASS_TOP + y, (FENCE_Z0 + FENCE_Z1) / 2]}>
          <boxGeometry args={[0.06, 0.14, FENCE_Z1 - FENCE_Z0]} />
          <meshToonMaterial color={palette.fenceShade} gradientMap={TOON_GRADIENT} />
        </mesh>
      ))}
    </group>
  )
}

/** The mask on a robber's crate: a black band with two white eyes looking out of it. */
function MaskPicture({ z }: { z: number }) {
  return (
    <group position={[0, 0.1, z]}>
      <mesh>
        <boxGeometry args={[0.72, 0.24, 0.04]} />
        <meshToonMaterial color={palette.mask} gradientMap={TOON_GRADIENT} />
      </mesh>
      {[-0.18, 0.18].map((x) => (
        <group key={x} position={[x, 0, Math.sign(z) * 0.03]}>
          <mesh>
            <sphereGeometry args={[0.08, 10, 8]} />
            <meshBasicMaterial color={palette.eye} />
          </mesh>
          <mesh position={[0, 0, Math.sign(z) * 0.05]}>
            <sphereGeometry args={[0.04, 8, 6]} />
            <meshBasicMaterial color={palette.pupil} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/**
 * A surprise crate: blue with the police star or purple with the robber's mask on its
 * sides, a gold lid on top. Opened, it bursts (the sparkle is in Effects); knocked, it
 * tumbles away like a fence.
 */
function BoxModel({ sim, box }: { sim: Sim; box: Box }) {
  const root = useRef<Group>(null!)
  useFrame(() => {
    const g = root.current
    const x = box.x - sim.police.x
    if (box.hitAt < 0) {
      g.position.set(x, 0, 0)
      g.rotation.set(0, 0, 0.03 * Math.sin(sim.time * 4 + box.id))
      g.scale.setScalar(1)
      return
    }
    const t = sim.time - box.hitAt
    if (box.opened) {
      g.position.set(x, 0, 0)
      g.scale.setScalar(t < 0.2 ? 1 + 1.5 * t : 1e-4)
      return
    }
    fling(g, x, t)
  })
  const police = box.role === 'police'
  return (
    <group ref={root}>
      <RoundedBox args={[1.2, BOX_H, 1.2]} radius={0.08} smoothness={2} position={[0, BOX_H / 2, 0]} castShadow>
        <meshToonMaterial color={police ? palette.policeBox : palette.robberBox} gradientMap={TOON_GRADIENT} />
      </RoundedBox>
      <RoundedBox args={[1.28, 0.16, 1.28]} radius={0.04} smoothness={2} position={[0, BOX_H - 0.06, 0]}>
        <meshToonMaterial color={palette.lid} gradientMap={TOON_GRADIENT} />
      </RoundedBox>
      {[-0.61, 0.61].map((z) =>
        police ? (
          <mesh key={z} geometry={badgeGeometry} position={[0, 0.5, z - (z > 0 ? 0 : 0.05)]} scale={1.6}>
            <meshToonMaterial color={palette.badge} gradientMap={TOON_GRADIENT} />
          </mesh>
        ) : (
          <MaskPicture key={z} z={z + (z > 0 ? 0.02 : -0.02)} />
        ),
      )}
    </group>
  )
}

const CAR_L = CAR_HALF_L * 2
const CAR_W = CAR_HALF_W * 2

/** A car on the road: nose along +Z in its own frame, turned around for the lane going the other way; wheels turn with the distance. */
function CarModel({ sim, road, car }: { sim: Sim; road: Road; car: RoadCar }) {
  const root = useRef<Group>(null!)
  const wheels = useRef<Group[]>([])
  useFrame(() => {
    const g = root.current
    g.position.set(road.x + car.lane * LANE - sim.police.x, 0, car.z)
    g.rotation.y = car.vz > 0 ? 0 : Math.PI
    for (const w of wheels.current) w.rotation.x = car.z / 0.4
  })
  const color = palette.car[car.style]!
  return (
    <group ref={root}>
      <RoundedBox args={[CAR_W - 0.2, 0.7, CAR_L - 0.3]} radius={0.1} smoothness={2} position={[0, 0.75, 0]} castShadow>
        <meshToonMaterial color={color} gradientMap={TOON_GRADIENT} />
      </RoundedBox>
      <RoundedBox args={[CAR_W - 0.5, 0.62, 1.9]} radius={0.1} smoothness={2} position={[0, 1.38, -0.2]} castShadow>
        <meshToonMaterial color={palette.glass} gradientMap={TOON_GRADIENT} />
      </RoundedBox>
      <RoundedBox args={[CAR_W - 0.4, 0.1, 1.7]} radius={0.03} smoothness={2} position={[0, 1.72, -0.2]}>
        <meshToonMaterial color={color} gradientMap={TOON_GRADIENT} />
      </RoundedBox>
      {[-1, 1].map((sx) =>
        [-1.2, 1.2].map((z) => (
          <group
            key={`${sx}${z}`}
            position={[sx * (CAR_HALF_W - 0.05), 0.4, z]}
            ref={(el) => {
              if (el && !wheels.current.includes(el)) wheels.current.push(el)
            }}
          >
            <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[0.4, 0.4, 0.3, 14]} />
              <meshToonMaterial color={palette.tyre} gradientMap={TOON_GRADIENT} />
            </mesh>
            <mesh rotation={[0, 0, Math.PI / 2]} position={[sx * 0.16, 0, 0]}>
              <cylinderGeometry args={[0.2, 0.2, 0.02, 10]} />
              <meshToonMaterial color={palette.wheel} gradientMap={TOON_GRADIENT} />
            </mesh>
          </group>
        )),
      )}
      {[-0.55, 0.55].map((x) => (
        <group key={x}>
          <mesh position={[x, 0.8, CAR_HALF_L - 0.12]}>
            <sphereGeometry args={[0.13, 10, 8]} />
            <meshBasicMaterial color={palette.headlight} />
          </mesh>
          <mesh position={[x, 0.8, -CAR_HALF_L + 0.1]}>
            <boxGeometry args={[0.26, 0.14, 0.06]} />
            <meshBasicMaterial color={palette.collar} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

const ROAD_LEN = CAR_NEAR - CAR_FAR + 12
const ROAD_Z = (CAR_NEAR + CAR_FAR) / 2
const DASHES = Array.from({ length: 22 }, (_, i) => CAR_FAR - 4 + i * 3)
const ZEBRA = Array.from({ length: 5 }, (_, i) => -2.2 + i * 1.1)

/** A road crossing the path: the strip, its dashed centre line, the zebra crossing on the path, and the traffic. */
function RoadModel({ sim, road }: { sim: Sim; road: Road }) {
  const root = useRef<Group>(null!)
  useFrame(() => {
    root.current.position.x = road.x - sim.police.x
  })
  return (
    <group ref={root}>
      {/* A little above the sidewalk and the kerb it crosses, so the two never share a plane. */}
      <mesh position={[0, 0.02, ROAD_Z]} receiveShadow>
        <boxGeometry args={[ROAD_HALF_W * 2, 0.08, ROAD_LEN]} />
        <meshToonMaterial color={palette.road} gradientMap={TOON_GRADIENT} />
      </mesh>
      {DASHES.map((z) => (
        <mesh key={z} position={[0, 0.08, z]}>
          <boxGeometry args={[0.16, 0.03, 1.4]} />
          <meshToonMaterial color={palette.roadLine} gradientMap={TOON_GRADIENT} />
        </mesh>
      ))}
      {ZEBRA.map((x) => (
        <mesh key={x} position={[x, 0.08, 0]}>
          <boxGeometry args={[0.8, 0.03, PATH_HALF_W * 2 + 0.4]} />
          <meshToonMaterial color={palette.zebra} gradientMap={TOON_GRADIENT} />
        </mesh>
      ))}
      <Synced list={() => road.cars} render={(car) => <CarModel key={car.id} sim={sim} road={road} car={car} />} />
    </group>
  )
}

/** A banana peel on the path, three flaps fanned out; slipped on, it flies off. */
function BananaModel({ sim, banana }: { sim: Sim; banana: Banana }) {
  const root = useRef<Group>(null!)
  useFrame(() => {
    const g = root.current
    const x = banana.x - sim.police.x
    if (banana.slippedAt < 0) {
      g.position.set(x, 0, 0)
      g.rotation.set(0, 0, 0)
    } else {
      fling(g, x, sim.time - banana.slippedAt)
    }
  })
  return (
    <group ref={root}>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[0, 0.06, 0]} rotation={[0, (i * Math.PI * 2) / 3 + 0.4, 0.12]} castShadow>
          <sphereGeometry args={[1, 10, 6]} />
          <meshToonMaterial color={palette.banana} gradientMap={TOON_GRADIENT} />
        </mesh>
      ))}
      <mesh position={[0, 0.12, 0]}>
        <sphereGeometry args={[0.1, 8, 6]} />
        <meshToonMaterial color={palette.bananaDark} gradientMap={TOON_GRADIENT} />
      </mesh>
    </group>
  )
}

/** Everything the sim lays along the street: houses, fences, crates, roads with their cars, banana peels. */
export function Lots({ sim }: { sim: Sim }) {
  return (
    <>
      <Synced list={() => sim.houses} render={(h) => <HouseModel key={h.id} sim={sim} house={h} />} />
      <Synced list={() => sim.fences} render={(f) => <FenceModel key={f.id} sim={sim} fence={f} />} />
      <Synced list={() => sim.boxes} render={(b) => <BoxModel key={b.id} sim={sim} box={b} />} />
      <Synced list={() => sim.roads} render={(r) => <RoadModel key={r.id} sim={sim} road={r} />} />
      <Synced list={() => sim.bananas} render={(p) => <BananaModel key={p.id} sim={sim} banana={p} />} />
    </>
  )
}
