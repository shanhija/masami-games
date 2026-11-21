import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer } from '@react-three/drei'
import {
  BackSide,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  Fog,
  Group,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three'

import { clamp01, mulberry32 } from '../game/math'
import { fogRange, STUDIO, sunOf, type Sunlight } from './look'

/** What the sky reads each frame: the time of day, and the ground point the sun's shadow window follows. */
export interface SkyAim {
  day: number
  targetX: number
  targetZ: number
}

/** The shadow window's width in metres. */
const WINDOW = 48
/** How far the sun sits from the window's middle. */
const SUN_DISTANCE = 60
/** The dome is this big and follow the camera, so they stay inside any far plane. */
const DOME_SCALE = 80

// ---------------------------------------------------------------------------------------
// The studio the machines reflect (mounted once by the caller).

function studioDome() {
  const g = new SphereGeometry(1, 24, 16)
  const p = g.attributes.position
  const colours = new Float32Array(p.count * 3)
  const top = new Color(STUDIO.dome.top)
  const mid = new Color(STUDIO.dome.horizon)
  const low = new Color(STUDIO.dome.ground)
  const c = new Color()
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i)
    c.copy(y > 0 ? mid.clone().lerp(top, y) : mid.clone().lerp(low, -y))
    colours.set([c.r, c.g, c.b], i * 3)
  }
  g.setAttribute('color', new Float32BufferAttribute(colours, 3))
  return g
}

/** The studio environment: mount it once, outside anything keyed. `Sky` sets `scene.environmentIntensity` from the day. */
export function StudioEnvironment() {
  const dome = useMemo(studioDome, [])
  return (
    <Environment frames={1} resolution={64}>
      <mesh scale={50} geometry={dome}>
        <meshBasicMaterial vertexColors side={BackSide} />
      </mesh>
      {STUDIO.lights.map((l, i) => (
        <Lightformer key={i} form={l.form} intensity={l.intensity} color={l.color} position={l.position as unknown as [number, number, number]} scale={l.scale as unknown as [number, number, number]} rotation={l.rotation as unknown as [number, number, number]} />
      ))}
    </Environment>
  )
}

// ---------------------------------------------------------------------------------------
// The sky dome: a gradient from the horizon colour (the fog's) to the top, with the sun or the moon.

const DOME_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

const DOME_FRAGMENT = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunColour;
uniform float uNight;
uniform float uTime;
varying vec3 vDir;
float hash3(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
void main() {
  float up = clamp(vDir.y, 0.0, 1.0);
  vec3 col = mix(uHorizon, uTop, pow(smoothstep(0.0, 0.75, up), 0.8));
  float d = max(dot(normalize(vDir), uSunDir), 0.0);
  col += uSunColour * pow(d, 14.0) * 0.22 * (1.0 - uNight);
  col += uSunColour * pow(d, 90.0) * 0.5;
  vec3 disc = mix(vec3(1.0, 0.98, 0.9), vec3(0.93, 0.95, 1.0), uNight);
  col = mix(col, disc, smoothstep(0.9975, 0.9985, d));
  // Stars: a point in some cells of a grid over the sphere, twinkling, only at night and above the haze.
  vec3 cell = vDir * 70.0;
  vec3 id = floor(cell);
  vec3 local = fract(cell) - 0.5;
  float h = hash3(id);
  vec3 jitter = vec3(hash3(id + 3.1), hash3(id + 7.7), hash3(id + 11.3)) - 0.5;
  float star = step(0.9, h) * (1.0 - smoothstep(0.0, 0.1 + 0.1 * fract(h * 40.0), length(local - jitter * 0.6)));
  float twinkle = 0.65 + 0.35 * sin(uTime * 1.7 + h * 60.0);
  col += vec3(1.0, 0.97, 0.88) * star * twinkle * uNight * smoothstep(0.02, 0.25, vDir.y);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

// ---------------------------------------------------------------------------------------
// Clouds: big soft puffs on rings far from the map, drifting round it.

const CLOUD_COUNT = 16
const NIGHT_CLOUD = new Color('#2b3566')

function cloudMesh(): InstancedMesh {
  const rand = mulberry32(21)
  const puffs: { m: Matrix4 }[] = []
  const q = new Quaternion()
  for (let c = 0; c < CLOUD_COUNT; c++) {
    const angle = (c / CLOUD_COUNT) * Math.PI * 2 + rand() * 0.3
    const radius = 140 + rand() * 120
    const height = 70 + rand() * 40
    const size = 12 + rand() * 12
    const n = 5 + Math.floor(rand() * 3)
    for (let k = 0; k < n; k++) {
      const along = (k - (n - 1) / 2) * size * 0.9
      const r = size * (0.7 + 0.5 * Math.sin((k / (n - 1)) * Math.PI) + rand() * 0.2)
      const x = Math.cos(angle) * radius - Math.sin(angle) * along
      const z = Math.sin(angle) * radius + Math.cos(angle) * along
      puffs.push({ m: new Matrix4().compose(new Vector3(x, height + (rand() - 0.3) * size * 0.3, z), q, new Vector3(r, r * 0.6, r)) })
    }
  }
  const geometry = new SphereGeometry(1, 10, 6)
  const p = geometry.attributes.position
  const shade = new Float32Array(p.count * 3)
  const top = new Color('#ffffff')
  const bottom = new Color('#d4deef')
  const c = new Color()
  for (let i = 0; i < p.count; i++) {
    c.copy(bottom).lerp(top, clamp01(0.5 + p.getY(i) * 0.7))
    shade.set([c.r, c.g, c.b], i * 3)
  }
  geometry.setAttribute('color', new Float32BufferAttribute(shade, 3))
  const material = new MeshBasicMaterial({ vertexColors: true, fog: false, toneMapped: false })
  const mesh = new InstancedMesh(geometry, material, puffs.length)
  puffs.forEach((p, i) => mesh.setMatrixAt(i, p.m))
  mesh.frustumCulled = false
  return mesh
}

// ---------------------------------------------------------------------------------------

/**
 * The light and the sky for one time of day: the one sun and one hemisphere light, the fog,
 * the gradient dome, stars at night and drifting clouds. The sun's shadow window follows the
 * point `aim()` gives each frame, snapped to whole texels of a `shadow` by `shadow` map.
 */
export function Sky({ aim, shadow }: { aim: () => SkyAim; shadow: 512 | 1024 | 2048 }) {
  const scene = useThree((s) => s.scene)
  const sun = useMemo(() => {
    const light = new DirectionalLight()
    light.castShadow = true
    const cam = light.shadow.camera
    cam.left = -WINDOW / 2
    cam.right = WINDOW / 2
    cam.top = WINDOW / 2
    cam.bottom = -WINDOW / 2
    cam.near = 1
    cam.far = SUN_DISTANCE * 2
    light.shadow.bias = -0.0004
    light.shadow.normalBias = 0.03
    return light
  }, [])
  const hemi = useMemo(() => new HemisphereLight(), [])
  const fog = useMemo(() => new Fog('#ffffff', 40, 150), [])
  const background = useMemo(() => new Color(), [])
  const dome = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uTop: { value: new Color() },
          uHorizon: { value: new Color() },
          uSunDir: { value: new Vector3(0, 1, 0) },
          uSunColour: { value: new Color() },
          uNight: { value: 0 },
          uTime: { value: 0 },
        },
        vertexShader: DOME_VERTEX,
        fragmentShader: DOME_FRAGMENT,
        side: BackSide,
        depthWrite: false,
        depthTest: false,
        fog: false,
      }),
    [],
  )
  const domeGeo = useMemo(() => new SphereGeometry(1, 32, 16), [])
  const clouds = useMemo(cloudMesh, [])
  const sky = useRef<Group>(null)
  const drift = useRef<Group>(null)
  const last = useRef<{ day: number; light: Sunlight } | null>(null)
  const right = useMemo(() => new Vector3(), [])
  const upAxis = useMemo(() => new Vector3(), [])
  const dir = useMemo(() => new Vector3(), [])
  const ahead = useMemo(() => new Vector3(), [])

  useEffect(() => {
    sun.shadow.mapSize.set(shadow, shadow)
    sun.shadow.map?.dispose()
    sun.shadow.map = null
  }, [sun, shadow])

  useEffect(
    () => () => {
      // The light's dispose frees its shadow map, which is null until the light first draws.
      sun.dispose()
      hemi.dispose()
    },
    [sun, hemi],
  )

  useEffect(() => {
    const old = { fog: scene.fog, background: scene.background }
    scene.fog = fog
    scene.background = background
    return () => {
      scene.fog = old.fog
      scene.background = old.background
    }
  }, [scene, fog, background])

  useEffect(
    () => () => {
      dome.dispose()
      domeGeo.dispose()
      clouds.geometry.dispose()
      ;(clouds.material as MeshBasicMaterial).dispose()
      clouds.dispose()
    },
    [dome, domeGeo, clouds],
  )

  useFrame((state, dt) => {
    const a = aim()
    if (last.current === null || last.current.day !== a.day) last.current = { day: a.day, light: sunOf(a.day) }
    const l = last.current.light

    dir.set(l.dir[0], l.dir[1], l.dir[2])
    // The window's middle, snapped to whole texels along the light's own axes.
    right.set(dir.z, 0, -dir.x).normalize()
    upAxis.crossVectors(dir, right)
    const texel = WINDOW / shadow
    const u = Math.round((a.targetX * right.x + a.targetZ * right.z) / texel) * texel
    const v = Math.round((a.targetX * upAxis.x + a.targetZ * upAxis.z) / texel) * texel
    const w = a.targetX * dir.x + a.targetZ * dir.z
    const mx = right.x * u + upAxis.x * v + dir.x * w
    const mz = right.z * u + upAxis.z * v + dir.z * w
    sun.target.position.set(mx, 0, mz)
    sun.target.updateMatrixWorld()
    sun.position.set(mx + dir.x * SUN_DISTANCE, dir.y * SUN_DISTANCE, mz + dir.z * SUN_DISTANCE)
    sun.color.copy(l.colour)
    sun.intensity = l.intensity

    hemi.color.copy(l.hemiSky)
    hemi.groundColor.copy(l.hemiGround)
    hemi.intensity = l.hemiIntensity

    fog.color.copy(l.fog)
    // The fog starts behind the ground the camera looks at, the distance along its view ray down to the ground.
    state.camera.getWorldDirection(ahead)
    const range = fogRange(l.fogFar, ahead.y < -0.01 ? state.camera.position.y / -ahead.y : 0)
    fog.near = range.near
    fog.far = range.far
    background.copy(l.skyHorizon)
    scene.environmentIntensity = l.env

    const u2 = dome.uniforms
    u2.uTop.value.copy(l.skyTop)
    u2.uHorizon.value.copy(l.skyHorizon)
    u2.uSunDir.value.copy(dir)
    u2.uSunColour.value.copy(l.colour)
    u2.uNight.value = l.night
    u2.uTime.value = state.clock.elapsedTime

    sky.current!.position.copy(state.camera.position)
    drift.current!.rotation.y += dt * 0.004
    // Clouds go from white to a dim blue at night.
    ;(clouds.material as MeshBasicMaterial).color.set('#ffffff').lerp(NIGHT_CLOUD, l.night)
  })

  return (
    <>
      <primitive object={sun} />
      <primitive object={sun.target} />
      <primitive object={hemi} />
      <group ref={sky}>
        <mesh geometry={domeGeo} material={dome} scale={DOME_SCALE} renderOrder={-100} frustumCulled={false} />
      </group>
      <group ref={drift}>
        <primitive object={clouds} />
      </group>
    </>
  )
}
