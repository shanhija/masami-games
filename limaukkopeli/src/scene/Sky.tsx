import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { AdditiveBlending, BackSide, BufferGeometry, Color, Float32BufferAttribute, Group, InstancedMesh, LatheGeometry, Mesh, MeshBasicMaterial, Object3D, Quaternion, SRGBColorSpace, ShaderMaterial, Vector2, Vector3 } from 'three'

import { mod, mulberry32, smoothstep } from '../game/math'
import type { CourseId, Sim } from '../game/model'
import { palette, type Theme } from './look'
import { glowPicture, moonPicture, sunPicture } from './pictures'
import { WATER_Y } from './place'
import { cached, once, starGeometry } from './shapes'

/** The fog starts this far from the camera and swallows everything by this far: the course near the slime stays crisp and the horizon melts into the sky. */
const FOG_NEAR = 30
const FOG_FAR = 140

/** The sky dome's radius, inside the camera's far plane; the sun, moon, stars and clouds sit a little inside it. */
const DOME_R = 450
const SKY_R = 400
/**
 * Where the sun or the moon hangs: ahead of the run and a little to the left, low enough
 * to be in view when the tower climb looks up. The light itself comes from behind the
 * camera so that shadows fall ahead of things (see Play); a child does not mind.
 */
const SUN_DIR = new Vector3(-0.34, 0.37, -0.86).normalize()

const scratch = new Object3D()
const UP = new Vector3(0, 1, 0)
const FACE = new Vector3(0, 0, 1)
const a = new Vector3()
const b = new Vector3()

/** A colour's sRGB values as written in the theme, for shaders that write straight to the screen. */
function srgb(hex: string) {
  const c = new Color(hex)
  const out = { r: 0, g: 0, b: 0 }
  c.getRGB(out, SRGBColorSpace)
  return new Vector3(out.r, out.g, out.b)
}

/**
 * Everything far away, all following the camera so it never comes nearer: the gradient
 * sky with a warm glow round the sun, the fog that melts the far water into it, soft
 * clouds drifting, the sun (or at night the moon, twinkling stars and now and then a
 * shooting star with the moon's path shimmering on the water), and the island's far hills
 * round the horizon.
 */
export function Sky({ sim, theme }: { sim: Sim; theme: Theme }) {
  const far = useRef<Group>(null!)
  const ground = useRef<Group>(null!)
  useFrame((state) => {
    const c = state.camera.position
    far.current.position.copy(c)
    ground.current.position.set(c.x, 0, c.z)
  })
  return (
    <>
      <fog attach="fog" args={[theme.fog, FOG_NEAR, FOG_FAR]} />
      <group ref={far}>
        <Dome theme={theme} />
        <Clouds sim={sim} />
        {theme.night ? <NightSky sim={sim} /> : <Sun sim={sim} />}
      </group>
      <group ref={ground}>
        <Hills course={sim.course.id} theme={theme} />
        {theme.night && <MoonPath sim={sim} />}
      </group>
    </>
  )
}

// ------------------------------------------------------------------ the dome

const DOME_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

/** Writes the theme's colours straight to the screen (no tone mapping), so the horizon is exactly the fog's colour and far things melt into it. */
const DOME_FRAGMENT = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uBottom;
uniform vec3 uFog;
uniform vec3 uGlow;
uniform vec3 uSun;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uFog, uBottom, smoothstep(-0.01, 0.08, h));
  col = mix(col, uTop, pow(smoothstep(0.05, 0.9, h), 0.75));
  float s = max(dot(d, uSun), 0.0);
  col += uGlow * (pow(s, 60.0) * 0.3 + pow(s, 9.0) * 0.07);
  gl_FragColor = vec4(col, 1.0);
}
`

/** The sky: the fog's colour at the horizon (and below it, where the far water ends), the island's sky colours above, a warm glow round the sun. */
function Dome({ theme }: { theme: Theme }) {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: DOME_VERTEX,
        fragmentShader: DOME_FRAGMENT,
        uniforms: {
          uTop: { value: srgb(theme.skyTop) },
          uBottom: { value: srgb(theme.skyBottom) },
          uFog: { value: srgb(theme.fog) },
          uGlow: { value: srgb(theme.night ? '#5a5aa0' : '#fff1c9') },
          uSun: { value: SUN_DIR.clone() },
        },
        side: BackSide,
        depthWrite: false,
        fog: false,
      }),
    [theme],
  )
  useLayoutEffect(() => () => material.dispose(), [material])
  return (
    <mesh material={material} renderOrder={-1000} frustumCulled={false}>
      <sphereGeometry args={[DOME_R, 32, 16]} />
    </mesh>
  )
}

// ------------------------------------------------------------------ the sun

/** A round cartoon sun with a soft warm glow, breathing a little. */
function Sun({ sim }: { sim: Sim }) {
  const glow = useRef<MeshBasicMaterial>(null!)
  const at = SUN_DIR.clone().multiplyScalar(SKY_R)
  useFrame(() => {
    glow.current.opacity = 0.24 + 0.04 * Math.sin(sim.time * 0.8)
  })
  return (
    <group position={at}>
      <sprite scale={85} renderOrder={-990}>
        <spriteMaterial ref={glow} map={glowPicture()} color="#fff2c8" transparent depthWrite={false} blending={AdditiveBlending} fog={false} toneMapped={false} />
      </sprite>
      <sprite scale={34} renderOrder={-989}>
        <spriteMaterial map={sunPicture()} transparent depthWrite={false} fog={false} toneMapped={false} />
      </sprite>
    </group>
  )
}

// ------------------------------------------------------------------ the night

const STARS = 520
const BIG_STARS = 14

const STAR_VERTEX = /* glsl */ `
attribute float aPhase;
attribute float aSize;
uniform float uTime;
uniform float uScale;
varying float vTwinkle;
void main() {
  vTwinkle = 0.55 + 0.45 * sin(uTime * (1.2 + fract(aPhase * 7.13) * 2.4) + aPhase * 6.2832);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale * (0.75 + 0.25 * vTwinkle);
}
`

const STAR_FRAGMENT = /* glsl */ `
uniform vec3 uColour;
varying float vTwinkle;
void main() {
  float d = length(gl_PointCoord - 0.5);
  gl_FragColor = vec4(uColour, smoothstep(0.5, 0.05, d) * vTwinkle);
}
`

/** The big stars' shape, kept for the page's life. */
const bigStarGeometry = once(() => starGeometry(5, 1, 0.45))

/** A point on the sky at an azimuth (0 straight ahead along three's -Z, positive to the left) and an elevation, both radians. */
function skyPoint(azimuth: number, elevation: number, r: number, out: Vector3) {
  return out.set(-Math.sin(azimuth) * Math.cos(elevation) * r, Math.sin(elevation) * r, -Math.cos(azimuth) * Math.cos(elevation) * r)
}

/** Star Night's sky: the moon with its glow, hundreds of twinkling stars, a few big star shapes, and every few seconds a shooting star. */
function NightSky({ sim }: { sim: Sim }) {
  const big = useRef<InstancedMesh>(null!)
  const shooting = useRef<Mesh>(null!)
  const streak = useRef<MeshBasicMaterial>(null!)
  const stars = useMemo(() => {
    const rand = mulberry32(5)
    const pos: number[] = []
    const phase: number[] = []
    const size: number[] = []
    while (pos.length < STARS * 3) {
      const az = rand() * Math.PI * 2
      const el = Math.asin(0.04 + rand() * 0.96)
      skyPoint(az, el, SKY_R + 10, a)
      pos.push(a.x, a.y, a.z)
      phase.push(rand())
      size.push(1.5 + rand() * rand() * 4)
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(pos, 3))
    g.setAttribute('aPhase', new Float32BufferAttribute(phase, 1))
    g.setAttribute('aSize', new Float32BufferAttribute(size, 1))
    return g
  }, [])
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: STAR_VERTEX,
        fragmentShader: STAR_FRAGMENT,
        uniforms: { uTime: { value: 0 }, uScale: { value: 1 }, uColour: { value: srgb('#fff8dc') } },
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        fog: false,
      }),
    [],
  )
  useLayoutEffect(
    () => () => {
      stars.dispose()
      material.dispose()
    },
    [stars, material],
  )
  const bigStars = useMemo(() => {
    const rand = mulberry32(17)
    return Array.from({ length: BIG_STARS }, () => ({ az: (rand() - 0.5) * 2.4, el: 0.12 + rand() * 0.55, size: 2.2 + rand() * 2.2, phase: rand() * Math.PI * 2 }))
  }, [])
  const star = bigStarGeometry()
  const q = useMemo(() => new Quaternion(), [])
  useFrame((state) => {
    const t = sim.time
    material.uniforms.uTime!.value = t
    material.uniforms.uScale!.value = state.gl.getPixelRatio()
    for (let i = 0; i < bigStars.length; i++) {
      const s = bigStars[i]!
      skyPoint(s.az, s.el, SKY_R - 10, scratch.position)
      b.copy(scratch.position).normalize().negate()
      q.setFromUnitVectors(FACE, b)
      scratch.quaternion.copy(q)
      scratch.rotateZ(0.2 * Math.sin(t * 0.7 + s.phase))
      scratch.scale.setScalar(s.size * (0.8 + 0.2 * Math.sin(t * 2.3 + s.phase)))
      scratch.updateMatrix()
      big.current.setMatrixAt(i, scratch.matrix)
    }
    big.current.instanceMatrix.needsUpdate = true
    // A shooting star crosses the sky in the first second of every seven.
    const cycle = Math.floor(t / 7)
    const u = mod(t, 7) / 1
    const m = shooting.current
    m.visible = u < 1
    if (!m.visible) return
    const rand = mulberry32(cycle * 7919 + 13)
    const az0 = (rand() - 0.5) * 1.6
    const el0 = 0.35 + rand() * 0.35
    const dir = rand() < 0.5 ? -1 : 1
    const head = Math.min(1, u * 1.25)
    const tail = Math.max(0, u * 1.25 - 0.35)
    skyPoint(az0 + dir * 0.45 * head, el0 - 0.18 * head, SKY_R - 20, a)
    skyPoint(az0 + dir * 0.45 * tail, el0 - 0.18 * tail, SKY_R - 20, b)
    m.position.copy(a).add(b).multiplyScalar(0.5)
    const len = a.distanceTo(b)
    b.sub(a).normalize()
    m.quaternion.setFromUnitVectors(UP, b)
    m.scale.set(1, Math.max(0.01, len), 1)
    streak.current.opacity = Math.sin(Math.PI * u)
  })
  return (
    <>
      <points geometry={stars} material={material} frustumCulled={false} renderOrder={-995} />
      <instancedMesh ref={big} args={[star, undefined, BIG_STARS]} frustumCulled={false} renderOrder={-994}>
        <meshBasicMaterial color={palette.star} fog={false} toneMapped={false} />
      </instancedMesh>
      <mesh ref={shooting} visible={false} renderOrder={-993}>
        <cylinderGeometry args={[0.9, 0.2, 1, 8]} />
        <meshBasicMaterial ref={streak} color="#fffbe6" transparent depthWrite={false} blending={AdditiveBlending} fog={false} toneMapped={false} />
      </mesh>
      <group position={SUN_DIR.clone().multiplyScalar(SKY_R)}>
        <sprite scale={120} renderOrder={-990}>
          <spriteMaterial map={glowPicture()} color="#9fb0ff" transparent opacity={0.45} depthWrite={false} blending={AdditiveBlending} fog={false} toneMapped={false} />
        </sprite>
        <sprite scale={30} renderOrder={-989}>
          <spriteMaterial map={moonPicture()} transparent depthWrite={false} fog={false} toneMapped={false} />
        </sprite>
      </group>
    </>
  )
}

/** The moon's path on the water: shimmering streaks from in front of the camera out toward the moon, widening into the distance. */
const MOON_STREAKS = 34
function MoonPath({ sim }: { sim: Sim }) {
  const mesh = useRef<InstancedMesh>(null!)
  const dx = SUN_DIR.x / Math.hypot(SUN_DIR.x, SUN_DIR.z)
  const dz = SUN_DIR.z / Math.hypot(SUN_DIR.x, SUN_DIR.z)
  const yaw = Math.atan2(dx, dz)
  useFrame(() => {
    const t = sim.time
    for (let i = 0; i < MOON_STREAKS; i++) {
      const d = 12 + i ** 1.45 * 3.2
      const shimmer = 0.7 + 0.3 * Math.sin(t * 2.6 + i * 1.9)
      // A flat disc turned so its z runs toward the moon: wide across the path, thin along it.
      scratch.position.set(dx * d, WATER_Y + 0.03, dz * d)
      scratch.rotation.set(0, yaw, 0)
      scratch.scale.set((0.3 + d * 0.035) * shimmer, 1, 0.07 + d * 0.004)
      scratch.updateMatrix()
      mesh.current.setMatrixAt(i, scratch.matrix)
    }
    mesh.current.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, MOON_STREAKS]} frustumCulled={false} renderOrder={2}>
      <cylinderGeometry args={[1, 1, 0.01, 16]} />
      <meshBasicMaterial color="#fff2c0" transparent opacity={0.5} depthWrite={false} fog={false} toneMapped={false} />
    </instancedMesh>
  )
}

// ------------------------------------------------------------------ clouds

interface Puff {
  x: number
  y: number
  z: number
  r: number
}

/** The clouds' colours and how many there are, per island. */
const CLOUD_LOOK: Record<CourseId, { colour: string; glow: string; glowIntensity: number; count: number }> = {
  park: { colour: '#ffffff', glow: '#eef6ff', glowIntensity: 0.55, count: 10 },
  beach: { colour: '#ffffff', glow: '#fff4e4', glowIntensity: 0.55, count: 8 },
  candy: { colour: '#fff4fa', glow: '#ffd2ec', glowIntensity: 0.6, count: 11 },
  winter: { colour: '#f4f8ff', glow: '#e6f0ff', glowIntensity: 0.55, count: 12 },
  night: { colour: '#5c5aa8', glow: '#3a3580', glowIntensity: 0.25, count: 5 },
}

/** Soft round clouds low over the horizon all round, most of them ahead, drifting slowly round the sky. */
function Clouds({ sim }: { sim: Sim }) {
  const root = useRef<Group>(null!)
  const mesh = useRef<InstancedMesh>(null!)
  const look = CLOUD_LOOK[sim.course.id]
  const puffs = useMemo(() => {
    const rand = mulberry32(31 + look.count)
    const out: Puff[] = []
    for (let c = 0; c < look.count; c++) {
      // Two in three clouds hang ahead of the run, the rest behind (the ready view looks back).
      const ahead = c % 3 !== 2
      const az = ahead ? (rand() - 0.5) * 2.6 : Math.PI + (rand() - 0.5) * 2.4
      const el = 0.05 + rand() * 0.2
      skyPoint(az, el, 300 + rand() * 40, a)
      const size = 9 + rand() * 9
      const n = 5 + Math.floor(rand() * 3)
      // Lay the puffs out across the line of sight.
      b.set(Math.cos(az), 0, -Math.sin(az))
      for (let i = 0; i < n; i++) {
        const along = (i / (n - 1) - 0.5) * size * 2.6
        const r = size * (i === 0 || i === n - 1 ? 0.55 : 0.75 + rand() * 0.45)
        out.push({ x: a.x + b.x * along + (rand() - 0.5) * size * 0.5, y: a.y + (rand() - 0.2) * size * 0.35, z: a.z + b.z * along + (rand() - 0.5) * size * 0.5, r })
      }
    }
    return out
  }, [look])
  useLayoutEffect(() => {
    puffs.forEach((p, i) => {
      scratch.position.set(p.x, p.y, p.z)
      scratch.rotation.set(0, 0, 0)
      scratch.scale.set(p.r, p.r * 0.62, p.r)
      scratch.updateMatrix()
      mesh.current.setMatrixAt(i, scratch.matrix)
    })
    mesh.current.instanceMatrix.needsUpdate = true
  }, [puffs])
  useFrame(() => {
    root.current.rotation.y = sim.time * 0.004
  })
  return (
    <group ref={root}>
      <instancedMesh ref={mesh} args={[undefined, undefined, puffs.length]} frustumCulled={false} renderOrder={-980}>
        <sphereGeometry args={[1, 14, 10]} />
        <meshStandardMaterial color={look.colour} emissive={look.glow} emissiveIntensity={look.glowIntensity} roughness={1} fog={false} toneMapped={false} />
      </instancedMesh>
    </group>
  )
}

// ------------------------------------------------------------------ far hills

/** How each island's horizon looks: round hills or pointed mountains, their colours, and what they wear on top: a snowy or iced cap, or a round tree. */
interface HillLook {
  shape: 'round' | 'peak'
  colours: readonly string[]
  top: { kind: 'cap' | 'tree'; colour: string }
}
const HILL_LOOK: Record<CourseId, HillLook> = {
  park: { shape: 'round', colours: ['#6fc66a', '#7fd070', '#5fb862'], top: { kind: 'tree', colour: '#4fae5a' } },
  beach: { shape: 'round', colours: ['#f0d79a', '#e8cc88'], top: { kind: 'tree', colour: '#62c06a' } },
  candy: { shape: 'peak', colours: ['#ff9fd0', '#c9a0ff', '#9fe8d0', '#ffd27a'], top: { kind: 'cap', colour: '#ffffff' } },
  winter: { shape: 'peak', colours: ['#a9c6e8', '#b8d2ee', '#9dbbe0'], top: { kind: 'cap', colour: '#ffffff' } },
  night: { shape: 'round', colours: ['#2c2f7a', '#34388a', '#262a6e'], top: { kind: 'tree', colour: '#3d4aa8' } },
}

/** A unit rounded hill (a soft dome) or a unit rounded peak, base radius 1 at y = 0, top at y = 1, kept for the page's life. */
const hillGeometry = cached((shape: 'round' | 'peak') => {
  const pts =
    shape === 'round'
      ? Array.from({ length: 10 }, (_, i) => {
          const u = i / 9
          return new Vector2(Math.cos((u * Math.PI) / 2) * 1, Math.sin((u * Math.PI) / 2) ** 0.8)
        })
      : [
          [1, 0],
          [0.82, 0.12],
          [0.5, 0.45],
          [0.22, 0.82],
          [0.1, 0.95],
          [0, 1],
        ].map(([x, y]) => new Vector2(x, y))
  return new LatheGeometry(pts, 20)
})

/**
 * The far horizon: a ring of hills or mountains round the camera in hazy island colours,
 * with snowy or iced tops or little round trees. Seen from high up the tower they melt
 * into the haze, as far land does.
 */
function Hills({ course, theme }: { course: CourseId; theme: Theme }) {
  const look = HILL_LOOK[course]
  const body = useRef<InstancedMesh>(null!)
  const top = useRef<InstancedMesh>(null!)
  const materials = useRef<(MeshBasicMaterial | null)[]>([])
  useFrame((state) => {
    const opacity = 1 - 0.75 * smoothstep(6, 26, state.camera.position.y)
    for (const m of materials.current) {
      if (!m) throw new Error('a hill material is missing')
      m.opacity = opacity
    }
  })
  const geo = hillGeometry(look.shape)
  const hills = useMemo(() => {
    const rand = mulberry32(99 + look.colours.length)
    const out: { x: number; z: number; w: number; h: number; colour: number }[] = []
    for (let az = -Math.PI; az < Math.PI; az += 0.16 + rand() * 0.2) {
      const d = 330 + rand() * 60
      skyPoint(az, 0, d, a)
      const h = look.shape === 'peak' ? 14 + rand() * 22 : 6 + rand() * 14
      out.push({ x: a.x, z: a.z, w: (look.shape === 'peak' ? 22 : 34) + rand() * 30, h, colour: Math.floor(rand() * look.colours.length) })
    }
    return out
  }, [look])
  useLayoutEffect(() => {
    const fog = new Color(theme.fog)
    const c = new Color()
    hills.forEach((h, i) => {
      scratch.position.set(h.x, WATER_Y - 0.5, h.z)
      scratch.rotation.set(0, i, 0)
      scratch.scale.set(h.w, h.h, h.w * 0.8)
      scratch.updateMatrix()
      body.current.setMatrixAt(i, scratch.matrix)
      // Far away, colours fade halfway into the haze.
      body.current.setColorAt(i, c.set(look.colours[h.colour]!).lerp(fog, 0.42))
      if (look.top.kind === 'cap') {
        // The top of the peak again, smaller, sitting on it like snow or icing.
        scratch.position.set(h.x, WATER_Y - 0.5 + h.h * 0.6, h.z)
        scratch.scale.set(h.w * 0.32, h.h * 0.4, h.w * 0.32 * 0.8)
      } else {
        scratch.position.set(h.x + h.w * 0.2, WATER_Y - 0.5 + h.h * 0.92, h.z)
        scratch.scale.set(h.h * 0.32, h.h * 0.3, h.h * 0.32)
      }
      scratch.updateMatrix()
      top.current.setMatrixAt(i, scratch.matrix)
      top.current.setColorAt(i, c.set(look.top.colour).lerp(fog, look.top.kind === 'cap' ? 0.25 : 0.42))
    })
    body.current.instanceMatrix.needsUpdate = true
    body.current.instanceColor!.needsUpdate = true
    top.current.instanceMatrix.needsUpdate = true
    top.current.instanceColor!.needsUpdate = true
  }, [hills, look, theme])
  return (
    <>
      <instancedMesh ref={body} args={[geo, undefined, hills.length]} frustumCulled={false} renderOrder={-970}>
        <meshBasicMaterial
          ref={(m) => {
            materials.current[0] = m
          }}
          transparent
          fog={false}
          toneMapped={false}
        />
      </instancedMesh>
      <instancedMesh ref={top} args={[look.top.kind === 'cap' ? geo : undefined, undefined, hills.length]} frustumCulled={false} renderOrder={-969}>
        {look.top.kind === 'tree' && <sphereGeometry args={[1, 12, 8]} />}
        <meshBasicMaterial
          ref={(m) => {
            materials.current[1] = m
          }}
          transparent
          fog={false}
          toneMapped={false}
        />
      </instancedMesh>
    </>
  )
}
