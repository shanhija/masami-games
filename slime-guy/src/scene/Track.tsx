import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, BufferGeometry, Color, CylinderGeometry, DoubleSide, Float32BufferAttribute, Group, InstancedMesh, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, Sprite, type Camera } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

import { clamp01, lerp, mod, mulberry32, smoothstep } from '../game/math'
import { ANIMALS, POLE_DZ, POLE_X, type Course, type Sim } from '../game/model'
import { Decor } from './Decor'
import { RIM_R, onGround, trackGeometry } from './ground'
import { palette, toThree, type Theme } from './look'
import { animalPicture, bandPicture, flagPicture, glowPicture, startPicture } from './pictures'
import { CARD_LIT_DX, CARD_LIT_DZ, CARD_LIT_SCALE, CARD_POP, CARD_W, FLAG_CLOTH_H, FLAG_TOP, KEY_Y, MARK_DROP, POLE_H, WATER_Y, cardCentre, cardSpan, flagPoles, mainSpanAt } from './place'
import { cached, easeOutBack, once, starGeometry } from './shapes'

const scratch = new Object3D()

/**
 * The course itself: the track as one soft toy over the water, its holes with a ring
 * round them and the lily pads that float into them, the water with its sparkles, the
 * start line, the checkpoint flags, the balloon arch at the finish with the key under it,
 * the measuring pole, and the island's scenery in the water.
 */
export function Track({ sim, theme }: { sim: Sim; theme: Theme }) {
  const course = sim.course
  return (
    <>
      <Slabs course={course} theme={theme} sim={sim} />
      <Water sim={sim} theme={theme} />
      <Holes sim={sim} theme={theme} />
      <StartLine course={course} />
      {course.flags.map((_, i) => ([0, 1] as const).map((side) => <FlagPole key={`${i}-${side}`} sim={sim} theme={theme} index={i} side={side} />))}
      <FinishArch sim={sim} theme={theme} />
      <Key sim={sim} />
      <MeasuringPole sim={sim} theme={theme} />
      <Decor sim={sim} theme={theme} />
    </>
  )
}

// ------------------------------------------------------------------ the slabs

/** The track's top in its two bands, the rim in the island's edge colour (glowing a little at night), the wall in its side colour, and the foam breathing on the water round it. */
function Slabs({ course, theme, sim }: { course: Course; theme: Theme; sim: Sim }) {
  const geo = trackGeometry(course)
  const foam = useRef<MeshBasicMaterial>(null!)
  useFrame(() => {
    foam.current.opacity = 0.72 + 0.2 * Math.sin(sim.time * 1.3)
  })
  return (
    <group>
      <mesh geometry={geo.cap} receiveShadow>
        <meshStandardMaterial map={bandPicture(theme)} roughness={0.62} />
      </mesh>
      <mesh geometry={geo.rim} castShadow receiveShadow>
        <meshStandardMaterial color={theme.edge} roughness={0.35} emissive={theme.edge} emissiveIntensity={theme.night ? 0.45 : 0} />
      </mesh>
      <mesh geometry={geo.wall} castShadow receiveShadow>
        <meshStandardMaterial color={theme.side} vertexColors roughness={0.8} />
      </mesh>
      <mesh geometry={geo.foam} renderOrder={1}>
        <meshBasicMaterial ref={foam} color={theme.foam} vertexColors transparent depthWrite={false} />
      </mesh>
    </group>
  )
}

// ------------------------------------------------------------------ the water

/** The water is a long strip this wide that moves along with the camera; its colour turns from near to deep between these distances from the middle of the course. */
const WATER_SPAN = 900
const DEEP_FROM = 6
const DEEP_TO = 55

/** The water's strip for an island, kept for the page's life. */
const waterGeometry = cached((theme: Theme) => {
  const xs = [0, 3, 6, 9, 13, 18, 24, 31, 40, 52, 70, 100, 150, 250, WATER_SPAN / 2]
  const across = [...xs.slice(1).reverse().map((x) => -x), ...xs]
  const near = new Color(theme.water)
  const deep = new Color(theme.waterDeep)
  const c = new Color()
  const pos: number[] = []
  const col: number[] = []
  const nor: number[] = []
  const idx: number[] = []
  across.forEach((x, i) => {
    c.copy(near).lerp(deep, smoothstep(DEEP_FROM, DEEP_TO, Math.abs(x)))
    for (const z of [-WATER_SPAN / 2, WATER_SPAN / 2]) {
      pos.push(x, 0, z)
      col.push(c.r, c.g, c.b)
      nor.push(0, 1, 0)
    }
    if (i > 0) {
      const a = 2 * (i - 1)
      idx.push(a, a + 1, a + 3, a, a + 3, a + 2)
    }
  })
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3))
  g.setAttribute('color', new Float32BufferAttribute(col, 3))
  g.setIndex(idx)
  g.computeBoundingSphere()
  return g
})
/** A water sparkle: a thin four-pointed glint. */
const sparkleGeometry = once(() => starGeometry(4, 1, 0.16))

/** Something on the water that stays put in the world but is only drawn in a box round the camera, wrapping round the box as the camera moves: where in the box, and how it twinkles. */
interface Glint {
  u: number
  v: number
  rate: number
  phase: number
  size: number
}
const SPARKLES = 190
const WAVES = 90

/**
 * Lays glints out in a box `w` across and `d` long from a little behind the camera to far
 * ahead of it (three's -Z): sparkles twinkle in and out as they turn, wave marks swell and
 * drift a little.
 */
function placeGlints(mesh: InstancedMesh, list: readonly Glint[], w: number, d: number, kind: 'sparkle' | 'wave', camera: Camera, t: number) {
  const cam = camera.position
  const x0 = cam.x - w / 2
  const z0 = cam.z - d + 8
  for (let i = 0; i < list.length; i++) {
    const g = list[i]!
    const x = x0 + mod(g.u * w - x0, w)
    const z = z0 + mod(g.v * d - z0, d)
    const k = Math.sin(t * g.rate + g.phase)
    if (kind === 'sparkle') {
      // A glint of light off the water turns to whoever looks at it.
      scratch.position.set(x, WATER_Y + 0.05, z)
      scratch.quaternion.copy(camera.quaternion)
      scratch.rotateZ(t * 0.6 + g.phase)
      scratch.scale.setScalar(k > 0 ? g.size * k * k : 1e-4)
    } else {
      scratch.position.set(x, WATER_Y + 0.015, z + 0.2 * Math.sin(t * 0.5 + g.phase))
      scratch.rotation.set(-Math.PI / 2, 0, 0)
      scratch.scale.setScalar(g.size * (0.65 + 0.35 * k))
    }
    scratch.updateMatrix()
    mesh.setMatrixAt(i, scratch.matrix)
  }
  mesh.instanceMatrix.needsUpdate = true
}

/**
 * The water: near the track a bright colour, deep further out, fading into the sky's
 * haze; twinkling sparkles and little white wave marks drift on it round the camera,
 * and it follows the camera along the course, so it never ends.
 */
function Water({ sim, theme }: { sim: Sim; theme: Theme }) {
  const plane = useRef<Mesh>(null!)
  const sparkles = useRef<InstancedMesh>(null!)
  const waves = useRef<InstancedMesh>(null!)
  const geo = waterGeometry(theme)
  const sparkle = sparkleGeometry()
  const glints = useMemo(() => {
    const rand = mulberry32(77)
    const make = (n: number, size: number) => Array.from({ length: n }, (): Glint => ({ u: rand(), v: rand(), rate: 1 + rand() * 2.2, phase: rand() * Math.PI * 2, size: size * (0.6 + rand() * 0.8) }))
    return { sparkles: make(SPARKLES, 0.26), waves: make(WAVES, 1.25) }
  }, [])
  useFrame((state) => {
    const t = sim.time
    plane.current.position.set(0, WATER_Y, state.camera.position.z)
    placeGlints(sparkles.current, glints.sparkles, 60, 80, 'sparkle', state.camera, t)
    placeGlints(waves.current, glints.waves, 70, 90, 'wave', state.camera, t)
  })
  return (
    <>
      <mesh ref={plane} geometry={geo} receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.35} metalness={0} />
      </mesh>
      <instancedMesh ref={sparkles} args={[sparkle, undefined, SPARKLES]} frustumCulled={false}>
        <meshBasicMaterial color={palette.white} transparent opacity={0.85} depthWrite={false} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={waves} args={[undefined, undefined, WAVES]} frustumCulled={false}>
        <torusGeometry args={[0.45, 0.05, 3, 10, 1.5]} />
        <meshBasicMaterial color={theme.foam} transparent opacity={0.65} depthWrite={false} />
      </instancedMesh>
    </>
  )
}

// ------------------------------------------------------------------ the holes

/** The lily pad lies just under the track's top, filling the hole, so the slime walks over it. */
const PAD_TOP = -0.012
const PAD_THICK = 0.1
const PAD_IN_FOR = 0.9
/** A unit lily pad with its notch. */
const padGeometry = once(() => new CylinderGeometry(1, 1, PAD_THICK, 40, 1, false, 0.35, Math.PI * 2 - 0.7))

/**
 * Every hole gets a soft coloured ring round it on the track, so a child sees it coming,
 * unless it runs off an edge; once it gets easy, a lily pad with a pink flower spins up
 * out of the water into it and bobs there.
 */
function Holes({ sim, theme }: { sim: Sim; theme: Theme }) {
  const course = sim.course
  const ringed = useMemo(
    () =>
      course.holes.map((h) => {
        const r = h.r + RIM_R + 0.35
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2
          const x = h.x + Math.cos(a) * r
          const z = h.z + Math.sin(a) * r
          if (!onGround(course, x, z) || course.holes.some((o) => o !== h && Math.hypot(x - o.x, z - o.z) < o.r + 0.2)) return false
        }
        return true
      }),
    [course],
  )
  const pads = useRef<(Group | null)[]>([])
  const padGeo = padGeometry()
  useFrame(() => {
    const t = sim.time
    for (let i = 0; i < sim.holes.length; i++) {
      const h = sim.holes[i]!
      const g = pads.current[i]
      if (!g) throw new Error('a lily pad is missing')
      g.visible = h.raftAt >= 0
      if (!g.visible) continue
      const age = t - h.raftAt
      const k = clamp01(age / PAD_IN_FOR)
      const pop = easeOutBack(k)
      const r = h.spec.r - 0.05
      g.position.set(h.spec.x, lerp(WATER_Y - 0.4, PAD_TOP - PAD_THICK / 2, pop) + 0.012 * Math.sin(t * 1.6 + i), -h.spec.z)
      g.rotation.set(0.03 * Math.sin(t * 1.1 + i), (1 - k) * (1 - k) * 4 + 0.1 * Math.sin(t * 0.4 + i), 0)
      g.scale.set(r * (0.35 + 0.65 * pop), 1, r * (0.35 + 0.65 * pop))
    }
  })
  return (
    <>
      {course.holes.map(
        (h, i) =>
          ringed[i] && (
            <mesh key={`ring-${i}`} position={toThree(h.x, 0.03, h.z)} rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, 0.55]} receiveShadow>
              <torusGeometry args={[h.r + RIM_R + 0.14, 0.075, 8, 56]} />
              <meshStandardMaterial color={theme.accent[1]} roughness={0.4} />
            </mesh>
          ),
      )}
      {course.holes.map((h, i) => (
        <group
          key={`pad-${i}`}
          ref={(g) => {
            pads.current[i] = g
          }}
          visible={false}
        >
          <mesh geometry={padGeo} receiveShadow castShadow>
            <meshStandardMaterial color={palette.lily} roughness={0.55} />
          </mesh>
          <mesh position={[0, PAD_THICK / 2 + 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={0.8}>
            <circleGeometry args={[1, 40, 0.35, Math.PI * 2 - 0.7]} />
            <meshStandardMaterial color="#7fd46a" roughness={0.55} polygonOffset polygonOffsetFactor={-1} />
          </mesh>
          {/* The flower sits out near the rim, scaled back so it stays a flower whatever the hole's size. */}
          <group position={[-0.62, PAD_THICK / 2, 0.2]} scale={[1 / h.r, 1, 1 / h.r]}>
            {[0, 1, 2, 3, 4].map((k) => (
              <mesh key={k} position={[Math.cos((k / 5) * Math.PI * 2) * 0.13, 0.07, Math.sin((k / 5) * Math.PI * 2) * 0.13]} scale={[0.13, 0.07, 0.13]}>
                <sphereGeometry args={[1, 12, 8]} />
                <meshStandardMaterial color="#ffb3dd" roughness={0.4} />
              </mesh>
            ))}
            <mesh position={[0, 0.1, 0]} scale={0.07}>
              <sphereGeometry args={[1, 10, 8]} />
              <meshStandardMaterial color="#ffe066" roughness={0.4} />
            </mesh>
          </group>
        </group>
      ))}
    </>
  )
}

// ------------------------------------------------------------------ the start line

/** The start line is just ahead of where the slime waits. */
const START_Z = 1.4

/** Black-and-white checks across the track just ahead of the slime. */
function StartLine({ course }: { course: Course }) {
  const span = mainSpanAt(course, START_Z)
  const w = span.x1 - span.x0 - 2 * RIM_R - 0.4
  return (
    <mesh position={toThree((span.x0 + span.x1) / 2, 0.003, START_Z)} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[w, 0.6]} />
      <meshStandardMaterial map={startPicture()} roughness={0.6} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
    </mesh>
  )
}

// ------------------------------------------------------------------ the flags

const CLOTH_W = 1.05
const CLOTH_X = 10
const CLOTH_Y = 3
/** A flag's cloth before the slime passes (pale, asleep) and after (the island's colour, cheering), kept for the page's life. */
const asleepCloth = once(() => new MeshStandardMaterial({ map: flagPicture('#f3f0ff', 'asleep'), side: DoubleSide, roughness: 0.75 }))
const cheerCloth = cached((colour: string) => new MeshStandardMaterial({ map: flagPicture(colour, 'cheer'), side: DoubleSide, roughness: 0.75 }))

/**
 * One checkpoint flag pole on its float in the water, its cloth reaching in over the
 * track with a sleeping slime face. When the slime passes it hops out of the water, the
 * face wakes up and cheers in the island's colour, and the cloth waves hard for a while.
 */
function FlagPole({ sim, theme, index, side }: { sim: Sim; theme: Theme; index: number; side: 0 | 1 }) {
  const course = sim.course
  const z = course.flags[index]!.z
  const x = flagPoles(course, z)[side]
  const root = useRef<Group>(null!)
  const cloth = useRef<Mesh>(null!)
  const asleep = asleepCloth()
  const cheer = cheerCloth(theme.accent[0])
  useFrame(() => {
    const t = sim.time
    const reachedAt = sim.flags[index]!.reachedAt
    const age = reachedAt >= 0 ? t - reachedAt : -1
    const hop = age >= 0 && age < 0.6 ? 0.55 * Math.sin((Math.PI * age) / 0.6) : 0
    root.current.position.set(x, hop + 0.03 * Math.sin(t * 1.5 + index + side), -z)
    root.current.rotation.z = (side === 0 ? 1 : -1) * 0.03 * Math.sin(t * 1.1 + index)
    const m = cloth.current
    m.material = age >= 0 ? cheer : asleep
    // Far down the course the waving is too small to see.
    if (Math.abs(sim.slime.z - z) > 70) return
    const amp = age < 0 ? 0.06 : age < 3 ? 0.17 : 0.1
    const speed = age < 0 ? 3.2 : age < 3 ? 7.5 : 4.2
    const pos = m.geometry.getAttribute('position')
    for (let iy = 0; iy <= CLOTH_Y; iy++) {
      for (let ix = 0; ix <= CLOTH_X; ix++) {
        const u = ix / CLOTH_X
        const along = u * CLOTH_W
        pos.setXYZ(iy * (CLOTH_X + 1) + ix, along, FLAG_CLOTH_H / 2 - (iy / CLOTH_Y) * FLAG_CLOTH_H - 0.05 * u * u, amp * u * Math.sin(along * 4.5 - t * speed + index * 1.7 + side))
      }
    }
    pos.needsUpdate = true
    m.geometry.computeVertexNormals()
  })
  return (
    <group ref={root}>
      <mesh position={[0, WATER_Y + 0.05, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[0.24, 0.1, 10, 20]} />
        <meshStandardMaterial color={theme.accent[1]} roughness={0.35} />
      </mesh>
      <mesh position={[0, (WATER_Y + FLAG_TOP) / 2, 0]} castShadow>
        <cylinderGeometry args={[0.055, 0.065, FLAG_TOP - WATER_Y, 12]} />
        <meshStandardMaterial color={palette.white} roughness={0.4} />
      </mesh>
      <mesh position={[0, FLAG_TOP + 0.08, 0]} castShadow>
        <sphereGeometry args={[0.13, 14, 10]} />
        <meshStandardMaterial color={theme.accent[0]} roughness={0.3} />
      </mesh>
      <mesh ref={cloth} position={[0, FLAG_TOP - FLAG_CLOTH_H / 2, 0]} scale={[side === 0 ? 1 : -1, 1, 1]} castShadow material={asleep}>
        <planeGeometry args={[CLOTH_W, FLAG_CLOTH_H, CLOTH_X, CLOTH_Y]} />
      </mesh>
    </group>
  )
}

// ------------------------------------------------------------------ the finish arch

/** The arch's legs rise this high before it curves over, and the balloons sit this far round its line, four at a time in a twist of colours. */
const ARCH_LEG = 1.3
const BALLOON_STEP = 0.42
const BALLOON_OUT = 0.27
const BALLOON_R = 0.25
/** Once the key is taken the balloons are let go, one after another over this long, and are gone this long after. */
const LET_GO_OVER = 0.8
const FLOWN_FOR = 8

/**
 * A twisted garland of balloons in the island's four accent colours over the track at
 * the finish, its feet on floats, every balloon bobbing on its own. When the slime takes
 * the key the balloons are let go: they float up and away out over the course, which
 * also clears the view of the measuring pole and of the tower.
 */
function FinishArch({ sim, theme }: { sim: Sim; theme: Theme }) {
  const course = sim.course
  const span = mainSpanAt(course, course.finishZ)
  const R = Math.max(-span.x0, span.x1) + 0.3
  const z = -course.finishZ
  const mesh = useRef<InstancedMesh>(null!)
  const balloons = useMemo(() => {
    const foot = WATER_Y + 0.25
    const leg = ARCH_LEG - foot
    const L = 2 * leg + Math.PI * R
    const out: { x: number; y: number; nx: number; ny: number; a: number; colour: number; delay: number; rise: number; drift: number }[] = []
    const rand = mulberry32(61)
    const steps = Math.round(L / BALLOON_STEP)
    for (let k = 0; k <= steps; k++) {
      const s = (k / steps) * L
      let x: number
      let y: number
      let nx: number
      let ny: number
      if (s < leg) {
        x = -R
        y = foot + s
        nx = -1
        ny = 0
      } else if (s < leg + Math.PI * R) {
        const a = Math.PI - (s - leg) / R
        x = R * Math.cos(a)
        y = ARCH_LEG + R * Math.sin(a)
        nx = Math.cos(a)
        ny = Math.sin(a)
      } else {
        x = R
        y = ARCH_LEG - (s - leg - Math.PI * R)
        nx = 1
        ny = 0
      }
      for (let j = 0; j < 4; j++) out.push({ x, y, nx, ny, a: (j / 4) * Math.PI * 2 + k * 0.7, colour: (j + k) % 4, delay: 0.15 + rand() * LET_GO_OVER, rise: 2.2 + rand() * 1.4, drift: (x < 0 ? -1 : 1) * (0.4 + rand() * 1.2) })
    }
    return out
  }, [R])
  useLayoutEffect(() => {
    const c = new Color()
    balloons.forEach((b, i) => mesh.current.setColorAt(i, c.set(theme.accent[b.colour]!)))
    mesh.current.instanceColor!.needsUpdate = true
  }, [balloons, theme])
  useFrame(() => {
    const t = sim.time
    const free = sim.finish.keyAt >= 0 ? t - sim.finish.keyAt : -1
    for (let i = 0; i < balloons.length; i++) {
      const b = balloons[i]!
      const out = BALLOON_OUT + 0.018 * Math.sin(t * 2.1 + i * 1.3)
      const ca = Math.cos(b.a)
      const sa = Math.sin(b.a)
      scratch.position.set(b.x + b.nx * ca * out, b.y + b.ny * ca * out, z + sa * out)
      // Let go: up faster and faster, out to its side, and back over the course, away from the tower.
      const d = free - b.delay
      if (free >= 0 && d > 0) {
        scratch.position.x += b.drift * d + 0.3 * Math.sin(t * 1.9 + i)
        scratch.position.y += b.rise * d + 0.5 * d * d
        scratch.position.z += 0.9 * d
      }
      scratch.rotation.set(0.1 * Math.sin(t * 1.7 + i), 0, 0.1 * Math.cos(t * 1.3 + i))
      scratch.scale.set(BALLOON_R, BALLOON_R * 1.13, BALLOON_R).multiplyScalar(free >= 0 && d > FLOWN_FOR ? 1e-4 : 1)
      scratch.updateMatrix()
      mesh.current.setMatrixAt(i, scratch.matrix)
    }
    mesh.current.instanceMatrix.needsUpdate = true
  })
  return (
    <>
      <instancedMesh ref={mesh} args={[undefined, undefined, balloons.length]} castShadow frustumCulled={false}>
        <sphereGeometry args={[1, 12, 9]} />
        <meshStandardMaterial roughness={0.22} />
      </instancedMesh>
      {[-R, R].map((x) => (
        <mesh key={x} position={[x, WATER_Y + 0.06, z]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <torusGeometry args={[0.42, 0.16, 12, 24]} />
          <meshStandardMaterial color={palette.white} roughness={0.35} />
        </mesh>
      ))}
    </>
  )
}

/** The key flies from the arch to the top of the slime's head in this long, then it is the HUD's. */
const KEY_FLY = 0.5
/** A tooth of the key's bit. */
const toothGeometry = once(() => new RoundedBoxGeometry(0.18, 0.1, 0.09, 2, 0.03))

/** The gold key floating and turning under the arch, glowing, until the slime takes it; then it flies onto the slime and is gone. */
function Key({ sim }: { sim: Sim }) {
  const root = useRef<Group>(null!)
  const halo = useRef<Sprite>(null!)
  const z = sim.course.finishZ
  useFrame(() => {
    const t = sim.time
    const f = sim.finish
    const age = f.keyAt >= 0 ? t - f.keyAt : -1
    const g = root.current
    g.visible = age < KEY_FLY
    if (!g.visible) return
    const hx = 0
    const hy = KEY_Y + 0.12 * Math.sin(t * 2.2)
    if (age < 0) {
      g.position.set(hx, hy, -z)
      g.rotation.set(0, t * 1.8, 0.15 * Math.sin(t * 1.3))
      g.scale.setScalar(1)
    } else {
      const k = age / KEY_FLY
      const s = sim.slime
      const tx = s.x
      const ty = s.y + 2 * s.r + 0.3
      const tz = s.z
      g.position.set(lerp(hx, tx, k), lerp(hy, ty, k) + Math.sin(Math.PI * k) * 1.2, -lerp(z, tz, k))
      g.rotation.set(0, t * 1.8 + k * 12, 0)
      g.scale.setScalar(1 - 0.65 * k)
    }
    halo.current.material.opacity = 0.55 + 0.2 * Math.sin(t * 3)
  })
  return (
    <group ref={root}>
      <sprite ref={halo} scale={1.7}>
        <spriteMaterial map={glowPicture()} color={palette.gold} transparent depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
      </sprite>
      <mesh position={[0, 0.36, 0]} castShadow>
        <torusGeometry args={[0.24, 0.085, 12, 28]} />
        <meshStandardMaterial color={palette.gold} metalness={0.55} roughness={0.25} emissive={palette.goldDeep} emissiveIntensity={0.35} />
      </mesh>
      <mesh position={[0, 0.36, 0]}>
        <sphereGeometry args={[0.09, 14, 10]} />
        <meshStandardMaterial color={palette.boxRed} roughness={0.2} />
      </mesh>
      <mesh position={[0, -0.12, 0]} castShadow>
        <cylinderGeometry args={[0.065, 0.065, 0.76, 12]} />
        <meshStandardMaterial color={palette.gold} metalness={0.55} roughness={0.25} emissive={palette.goldDeep} emissiveIntensity={0.35} />
      </mesh>
      {[-0.42, -0.24].map((y) => (
        <mesh key={y} geometry={toothGeometry()} position={[0.11, y, 0]}>
          <meshStandardMaterial color={palette.gold} metalness={0.55} roughness={0.25} emissive={palette.goldDeep} emissiveIntensity={0.35} />
        </mesh>
      ))}
    </group>
  )
}

// ------------------------------------------------------------------ the measuring pole

/** A card's board, by its height. */
const cardGeometry = cached((h: number) => new RoundedBoxGeometry(CARD_W, h, 0.07, 2, 0.03))

/**
 * The measuring pole beside the track at the finish: a striped pole with the five animal
 * cards stacked up its far side, each starting at the height a slime of that animal's size
 * stands. When the slime stops beside it, a gold ring drops to the top of its head and
 * that animal's card lights up, grows, steps out and bounces.
 */
function MeasuringPole({ sim, theme }: { sim: Sim; theme: Theme }) {
  const course = sim.course
  const px = POLE_X
  const pz = course.finishZ + POLE_DZ
  const ring = useRef<Mesh>(null!)
  const cards = useRef<(Group | null)[]>([])
  const glows = useRef<(Sprite | null)[]>([])
  const boards = useMemo(() => ANIMALS.map(() => new MeshStandardMaterial({ color: palette.white, roughness: 0.4, emissive: palette.gold, emissiveIntensity: 0 })), [])
  const centres = useMemo(() => ANIMALS.map((_, i) => cardCentre(course, i)), [course])
  useLayoutEffect(() => () => boards.forEach((b) => b.dispose()), [boards])
  // The pole's stripes change colour at every card's edge.
  const stripes = useMemo(() => {
    const edges = [0, ...ANIMALS.map((_, i) => cardSpan(i).bottom), POLE_H]
    return edges.slice(1).map((top, i) => ({ bottom: edges[i]!, top }))
  }, [])
  useFrame(() => {
    const t = sim.time
    const f = sim.finish
    const age = f.measureAt >= 0 ? t - f.measureAt : -1
    ring.current.visible = age >= 0
    if (age >= 0) {
      const k = clamp01(age / MARK_DROP)
      const h = 2 * sim.slime.r
      ring.current.position.y = lerp(POLE_H, h, k * k) + (k >= 1 ? 0.04 * Math.exp(-(age - MARK_DROP) * 6) * Math.sin((age - MARK_DROP) * 25) : 0)
    }
    for (let i = 0; i < ANIMALS.length; i++) {
      const g = cards.current[i]
      const glow = glows.current[i]
      if (!g || !glow) throw new Error('a measuring card is missing')
      const c = centres[i]!
      const lit = age >= MARK_DROP && f.animal === i
      const k = lit ? clamp01((age - MARK_DROP) / CARD_POP) : 0
      const pop = easeOutBack(k)
      const bounce = lit ? 1 + 0.06 * Math.sin((age - MARK_DROP) * 7) : 1
      g.position.set(c.x + CARD_LIT_DX * pop, c.y + (lit ? 0.06 * Math.abs(Math.sin((age - MARK_DROP) * 3.5)) : 0), -(c.z + CARD_LIT_DZ * pop))
      g.scale.setScalar((1 + (CARD_LIT_SCALE - 1) * pop) * bounce)
      boards[i]!.emissiveIntensity = 0.5 * pop
      glow.visible = lit
      glow.material.opacity = 0.75 * pop
    }
  })
  return (
    <group>
      <group position={toThree(px, 0, pz)}>
        <mesh position={[0, 0.08, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.3, 0.34, 0.16, 24]} />
          <meshStandardMaterial color={theme.accent[1]} roughness={0.4} />
        </mesh>
        {stripes.map((s, i) => (
          <mesh key={i} position={[0, (s.bottom + s.top) / 2, 0]} castShadow>
            <cylinderGeometry args={[0.085, 0.085, s.top - s.bottom, 14]} />
            <meshStandardMaterial color={i % 2 === 0 ? palette.white : theme.accent[0]} roughness={0.4} />
          </mesh>
        ))}
        <mesh position={[0, POLE_H + 0.12, 0]} castShadow>
          <sphereGeometry args={[0.17, 16, 12]} />
          <meshStandardMaterial color={theme.accent[0]} roughness={0.3} />
        </mesh>
        <mesh ref={ring} rotation={[Math.PI / 2, 0, 0]} visible={false}>
          <torusGeometry args={[0.2, 0.055, 10, 24]} />
          <meshStandardMaterial color={palette.gold} metalness={0.5} roughness={0.25} emissive={palette.goldDeep} emissiveIntensity={0.4} />
        </mesh>
      </group>
      {ANIMALS.map((_, i) => {
        const { bottom, top } = cardSpan(i)
        const h = top - bottom - 0.04
        return (
          <group
            key={i}
            ref={(g) => {
              cards.current[i] = g
            }}
          >
            <sprite
              ref={(s) => {
                glows.current[i] = s
              }}
              position={[0, 0, -0.05]}
              scale={[CARD_W * 1.9, h * 2.6, 1]}
              visible={false}
            >
              <spriteMaterial map={glowPicture()} color={palette.gold} transparent depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
            </sprite>
            <mesh geometry={cardGeometry(h)} material={boards[i]} castShadow />
            <mesh position={[0, 0, 0.037]}>
              <planeGeometry args={[Math.min(CARD_W - 0.08, (h - 0.06) * (4 / 3)), h - 0.06]} />
              <meshStandardMaterial map={animalPicture(i)} roughness={0.5} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}
