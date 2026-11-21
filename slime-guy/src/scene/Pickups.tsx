import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ExtrudeGeometry, Group, InstancedMesh, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, Object3D, Shape, SphereGeometry, Vector3 } from 'three'

import { SLIME_COLOURS, type SlimeLook } from '../game/closet'
import { clamp01, lerp } from '../game/math'
import { BALL_R, DROP_FOR, HIDDEN_TOP, type Ball, type Sim } from '../game/model'
import { jiggle, merge, nearSlime, placed, useDrawNear, useOwned } from './foam'
import { palette, toThree } from './look'
import { BabySlime } from './Slime'

/** A taken ball hops into the slime over this long, shrinking as it goes. */
const TAKE_FOR = 0.25
/** A knocked-off ball's arc rises this much over the straight line from where it flew off to where it lands. */
const DROP_HOP = 1.2
/** Room for this many knocked-off balls beyond the course's own before the instances have to grow. */
const SPARE = 32
/** The white shine on every ball sits up, left and toward the camera, just out of the jelly. */
const SHINE = new Vector3(-0.42, 0.6, 0.5).normalize().multiplyScalar(BALL_R * 0.8)
/** A found baby's cloud or flower puffs away over this long. */
const POOF_FOR = 0.35
/** A baby whose spot is higher than this floats on a little cloud; lower, it sits on a flower on the track. */
const FLOAT_FROM = 0.3

const dummy = new Object3D()
const from = new Vector3()

/**
 * What the slime picks up: the slime balls, glossy see-through jelly in the slime's own
 * colour, and the three lost babies waiting on the course.
 */
export function Pickups({ sim, look }: { sim: Sim; look: SlimeLook }) {
  const kit = useBabyKit()
  return (
    <>
      <Balls sim={sim} look={look} />
      {sim.babies.map((b) => (
        <WaitingBaby key={b.index} sim={sim} index={b.index} kit={kit} />
      ))}
    </>
  )
}

/** Where a ball is at time t, leaving out a take: on its knocked-off arc, or floating with a gentle bob. */
function ballAt(b: Ball, t: number, out: Vector3) {
  if (b.droppedAt >= 0 && t < b.droppedAt + DROP_FOR) {
    const u = clamp01((t - b.droppedAt) / DROP_FOR)
    return out.set(lerp(b.fromX, b.x, u), lerp(b.fromY, b.y, u) + DROP_HOP * 4 * u * (1 - u), lerp(b.fromZ, b.z, u))
  }
  return out.set(b.x, b.y + 0.06 * Math.sin(t * 2.2 + b.id * 1.7), b.z)
}

/**
 * Every ball as three instanced meshes: the jelly shell (clearcoat, a little see-through),
 * a deeper core that gives it depth, and a white shine. Floating balls bob and wobble like
 * jelly; a knocked-off one flies its arc from where the paddle hit to where it lands and
 * squashes there; a taken one hops into the slime (further ones hop higher, as when a big
 * slime's bounce pulls them in) and shrinks away over TAKE_FOR. Balls far from the slime
 * are left out.
 */
function Balls({ sim, look }: { sim: Sim; look: SlimeLook }) {
  const [capacity, setCapacity] = useState(() => sim.course.balls.length + SPARE)
  const shell = useRef<InstancedMesh>(null!)
  const core = useRef<InstancedMesh>(null!)
  const shine = useRef<InstancedMesh>(null!)
  const kit = useOwned(
    (own) => ({
      shellShape: own(new SphereGeometry(BALL_R, 24, 16)),
      coreShape: own(new SphereGeometry(BALL_R * 0.55, 14, 10)),
      shineShape: own(new SphereGeometry(BALL_R * 0.22, 10, 8)),
      shell: own(new MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.08 })),
      core: own(new MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 })),
      shine: own(new MeshBasicMaterial({ color: '#ffffff', toneMapped: false })),
    }),
    [],
  )
  useLayoutEffect(() => {
    const c = SLIME_COLOURS[look.colour]
    kit.shell.color.set(c.body)
    kit.core.color.set(c.deep)
  }, [look.colour, kit])
  useFrame(() => {
    const balls = sim.balls
    if (balls.length > capacity) setCapacity(balls.length * 2)
    const t = sim.time
    const slime = sim.slime
    const centre = slime.hidden ? HIDDEN_TOP / 2 : slime.r
    let n = 0
    for (const b of balls) {
      if (n >= capacity) break
      let scale = 1
      let wob = 0.07 * Math.sin(t * 5 + b.id * 2.3)
      if (b.takenAt >= 0) {
        const since = t - b.takenAt
        if (since >= TAKE_FOR) continue
        const u = since / TAKE_FOR
        ballAt(b, b.takenAt, from)
        const dist = Math.hypot(slime.x - from.x, slime.y + centre - from.y, slime.z - from.z)
        from.set(lerp(from.x, slime.x, u), lerp(from.y, slime.y + centre, u) + (0.25 + 0.2 * dist) * 4 * u * (1 - u), lerp(from.z, slime.z, u))
        scale = 1 - 0.7 * u
        wob = 0.15 * u
      } else {
        if (!nearSlime(sim, b.z, b.z)) continue
        ballAt(b, t, from)
        if (b.droppedAt >= 0) wob += jiggle(t, b.droppedAt + DROP_FOR, 0.3, 3, 0.4)
      }
      dummy.position.set(from.x, from.y, -from.z)
      dummy.scale.set(scale * (1 + wob * 0.6), scale * (1 - wob), scale * (1 + wob * 0.6))
      dummy.updateMatrix()
      shell.current.setMatrixAt(n, dummy.matrix)
      core.current.setMatrixAt(n, dummy.matrix)
      dummy.position.set(from.x + SHINE.x * scale, from.y + SHINE.y * scale, -from.z + SHINE.z * scale)
      dummy.scale.set(scale, scale * 0.7, scale)
      dummy.updateMatrix()
      shine.current.setMatrixAt(n, dummy.matrix)
      n++
    }
    shell.current.count = n
    core.current.count = n
    shine.current.count = n
    shell.current.instanceMatrix.needsUpdate = true
    core.current.instanceMatrix.needsUpdate = true
    shine.current.instanceMatrix.needsUpdate = true
  })
  return (
    <group key={capacity}>
      <instancedMesh ref={core} args={[kit.coreShape, kit.core, capacity]} frustumCulled={false} />
      <instancedMesh ref={shell} args={[kit.shellShape, kit.shell, capacity]} frustumCulled={false} castShadow />
      <instancedMesh ref={shine} args={[kit.shineShape, kit.shine, capacity]} frustumCulled={false} />
    </group>
  )
}

type BabyKit = ReturnType<typeof useBabyKit>

/** A heart as a flat outline: the classic parametric heart, about one unit wide. */
function heartShape() {
  const shape = new Shape()
  const steps = 48
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2
    const x = (16 * Math.sin(a) ** 3) / 34
    const y = (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) / 34
    if (i === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  }
  return shape
}

/** What every waiting baby shares: its little cloud, its flower, the heart over its head. */
function useBabyKit() {
  return useOwned((own) => {
    const puffs: [number, number, number, number][] = [
      [0, -0.1, 0, 0.24],
      [0.22, -0.13, 0.02, 0.17],
      [-0.22, -0.12, -0.02, 0.18],
      [0.06, -0.14, 0.16, 0.16],
      [-0.06, -0.14, -0.15, 0.16],
    ]
    const petals = Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * Math.PI * 2
      return [new SphereGeometry(1, 14, 8), placed([Math.cos(a) * 0.2, 0.02, Math.sin(a) * 0.2], [0, -a, 0], [0.16, 0.035, 0.1])] as const
    })
    const heart = new ExtrudeGeometry(heartShape(), { depth: 0.08, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 3, curveSegments: 6 })
    heart.center()
    return {
      cloudShape: own(merge(puffs.map(([x, y, z, r]) => [new SphereGeometry(r, 16, 10), placed([x, y, z], [0, 0, 0], [1, 0.6, 1])] as const))),
      cloud: own(new MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, emissive: '#ffffff', emissiveIntensity: 0.15 })),
      petalsShape: own(merge(petals)),
      petal: own(new MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 })),
      flowerHeartShape: own(new SphereGeometry(0.1, 12, 8).scale(1, 0.35, 1).translate(0, 0.03, 0)),
      flowerHeart: own(new MeshStandardMaterial({ color: palette.ribbon, roughness: 0.5 })),
      heartShape: own(heart.scale(0.24, 0.24, 0.24)),
      heart: own(new MeshStandardMaterial({ color: palette.boxRed, roughness: 0.35, emissive: palette.boxRed, emissiveIntensity: 0.3 })),
    }
  }, [])
}

/**
 * A lost baby waiting where the course put it, on a little floating cloud up in the air
 * or on a daisy on the track, bouncing and waving for help under a beating heart. Once
 * the slime touches it the baby rides on the slime's head (the slime draws it from
 * then on) and the cloud or daisy puffs away. Babies already home from an earlier run
 * never wait here.
 */
function WaitingBaby({ sim, index, kit }: { sim: Sim; index: 0 | 1 | 2; kit: BabyKit }) {
  const spot = sim.babies[index]!
  const floating = spot.y > FLOAT_FROM
  const root = useRef<Group>(null!)
  const perch = useRef<Group>(null!)
  const sitter = useRef<Group>(null!)
  const heart = useRef<Group>(null!)
  const clock = useMemo(() => () => sim.time, [sim])
  const near = useDrawNear(sim, spot.z, spot.z)
  useFrame(() => {
    const b = sim.babies[index]!
    const t = sim.time
    const since = b.takenAt >= 0 ? t - b.takenAt : -1
    const show = !b.home && (b.takenAt < 0 || since < POOF_FOR) && near()
    root.current.visible = show
    if (!show) return
    const waiting = b.takenAt < 0
    root.current.position.y = b.y + (floating ? 0.05 * Math.sin(t * 1.8 + index * 2.1) : 0)
    sitter.current.visible = waiting
    heart.current.visible = waiting
    perch.current.scale.setScalar(waiting ? 1 : since < 0.1 ? 1 + since * 3 : 1.3 * (1 - (since - 0.1) / (POOF_FOR - 0.1)))
    if (waiting) {
      const beat = Math.max(0, Math.sin(t * 6 + index))
      heart.current.position.y = 0.72 + 0.06 * Math.sin(t * 2.5 + index)
      heart.current.scale.setScalar(1 + 0.18 * beat * beat)
      heart.current.rotation.y = 0.35 * Math.sin(t * 1.3 + index)
    }
  })
  return (
    <group ref={root} position={toThree(spot.x, spot.y, spot.z)}>
      <group ref={perch}>
        {floating ? (
          <mesh geometry={kit.cloudShape} material={kit.cloud} castShadow />
        ) : (
          <>
            <mesh geometry={kit.petalsShape} material={kit.petal} receiveShadow />
            <mesh geometry={kit.flowerHeartShape} material={kit.flowerHeart} />
          </>
        )}
      </group>
      <group ref={sitter}>
        <BabySlime index={index} clock={clock} wave={true} />
      </group>
      <group ref={heart} position={[0, 0.72, 0]}>
        <mesh geometry={kit.heartShape} material={kit.heart} />
      </group>
    </group>
  )
}
