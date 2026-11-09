import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  Float32BufferAttribute,
  Fog,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  OctahedronGeometry,
  PointLight,
  Points,
  PointsMaterial,
  Sprite,
  SpriteMaterial,
  Vector3,
  type DirectionalLight,
  type HemisphereLight,
} from 'three'

import { mulberry32 } from '../../../castle-builder/src/game/random'
import { CAMERA_FOV } from '../../../castle-builder/src/scene/look'
import { nightOf, skyOf } from '../engine/sky'
import { arcOf, daylight, newDaylight, pickLamps, type Lamp } from './daylight'
import { colorOf, type Clock } from './look'
import type { SceneSource } from './Stage'

/**
 * The sky over the diorama, from the world's sky (engine/sky.ts) through daylight.ts: the
 * background and the fog in the sky's colour, the sun (by night the moon) and the fill light,
 * the sun or the moon on its arc over the top of the view with stars at night, rain and snow
 * falling round the middle of the view and leaning with the wind, and a few real lights for the
 * lamps, fires, torches and glowing bodies near the middle of the view, each with a soft halo.
 * Colours ease toward what the sky says, so a jump (a sky painted pink) is a quick fade.
 */

/** Real lights the scene may give lamps at once: each costs every lit pixel, and a weak tablet has few to spare. */
export const LAMP_LIGHTS = 2
/** Halos round lamps: cheap sprites, so more of them. */
const HALOS = 16

/** Castle Builder's sun: where it stands from the aim at noon. */
const SUN_FROM = new Vector3(-40, 60, 34)

/**
 * The sun, the fill, the background and the fog, every frame. The sun follows the aim (its
 * shadows are Castle Builder's, in a box round the view) and swings a little with the time.
 */
export function SkyLights({ source, aim }: { source: SceneSource; aim: Vector3 }) {
  const sun = useRef<DirectionalLight>(null!)
  const fill = useRef<HemisphereLight>(null!)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const shown = useMemo(() => newDaylight(), [])
  const want = useMemo(() => newDaylight(), [])
  const background = useMemo(() => new Color(), [])
  const fog = useMemo(() => new Fog('#ffffff', 1e4, 2e4), [])
  const from = useMemo(() => new Vector3(), [])
  const first = useRef(true)
  useEffect(() => {
    scene.background = background
    scene.fog = fog
    return () => {
      scene.background = null
      scene.fog = null
    }
  }, [scene, background, fog])
  useFrame((_, delta) => {
    daylight(skyOf(source.world), want)
    // Ease toward it: a sudden change of colour is a quick fade, the time's own change is slow anyway.
    const k = first.current ? 1 : 1 - Math.exp(-4 * Math.min(delta, 0.1))
    first.current = false
    shown.sky.lerp(want.sky, k)
    shown.sun.lerp(want.sun, k)
    shown.fillSky.lerp(want.fillSky, k)
    shown.fillGround.lerp(want.fillGround, k)
    shown.sunIntensity += (want.sunIntensity - shown.sunIntensity) * k
    shown.fillIntensity += (want.fillIntensity - shown.fillIntensity) * k
    shown.fog += (want.fog - shown.fog) * k
    shown.turn += (want.turn - shown.turn) * k
    background.copy(shown.sky)
    fog.color.copy(shown.sky)
    // Fog by how far the camera stands: none at all at 0, thick round the room at 1.
    const d = camera.position.distanceTo(aim)
    if (shown.fog < 0.01) {
      fog.near = 1e4
      fog.far = 2e4
    } else {
      fog.near = d * (1.5 - 1.05 * shown.fog)
      fog.far = d * (3 - 2.1 * shown.fog)
    }
    const s = sun.current
    from.copy(SUN_FROM).applyAxisAngle(Y, shown.turn)
    s.position.set(aim.x + from.x, from.y, aim.z + from.z)
    s.target.position.set(aim.x, 0, aim.z)
    s.target.updateMatrixWorld()
    s.color.copy(shown.sun)
    s.intensity = shown.sunIntensity
    const f = fill.current
    f.color.copy(shown.fillSky)
    f.groundColor.copy(shown.fillGround)
    f.intensity = shown.fillIntensity
  })
  return (
    <>
      <directionalLight
        ref={sun}
        position={[-40, 60, 34]}
        intensity={2.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
        shadow-camera-left={-24}
        shadow-camera-right={24}
        shadow-camera-top={24}
        shadow-camera-bottom={-24}
        shadow-camera-near={1}
        shadow-camera-far={200}
      />
      <hemisphereLight ref={fill} args={['#ffffff', '#ffffff', 0.8]} />
    </>
  )
}

const Y = new Vector3(0, 1, 0)

/** How far behind everything the sky's sun, moon and stars hang (within the camera's far plane). */
const DEPTH = 260

/** A soft round glow, white in the middle and clear at the edge, for halos and the sun's. */
function glowTexture(): CanvasTexture {
  const n = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = n
  const g = canvas.getContext('2d')!
  const grad = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, n, n)
  return new CanvasTexture(canvas)
}

/**
 * The sun by day and the moon by night on an arc over the top of the view, and stars at night,
 * hung far behind the room from the camera: the slab covers them where it is, so they show in
 * the sky round it. Rain and fog hide them.
 */
export function SkyDome({ source }: { source: SceneSource }) {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const parts = useMemo(() => {
    const group = new Group()
    const sun = new Group()
    const sunDisc = new Mesh(new CircleGeometry(7, 24), new MeshBasicMaterial({ color: colorOf('#ffe27a'), fog: false, transparent: true }))
    const sunGlow = new Sprite(new SpriteMaterial({ map: glowTexture(), color: colorOf('#fff1b0'), blending: AdditiveBlending, depthWrite: false, fog: false, transparent: true }))
    sunGlow.scale.setScalar(34)
    sun.add(sunGlow, sunDisc)
    const moon = new Group()
    const moonDisc = new Mesh(new CircleGeometry(5.5, 24), new MeshBasicMaterial({ color: colorOf('#f4f1dc'), fog: false, transparent: true }))
    const craters = [
      [-1.6, 1.2, 1.1],
      [1.8, -0.6, 1.4],
      [-0.4, -2.2, 0.8],
    ].map(([x, y, r]) => {
      const m = new Mesh(new CircleGeometry(r!, 12), new MeshBasicMaterial({ color: colorOf('#d9d4b8'), fog: false, transparent: true }))
      m.position.set(x!, y!, 0.01)
      return m
    })
    const moonGlow = new Sprite(new SpriteMaterial({ map: glowTexture(), color: colorOf('#cfd8ff'), blending: AdditiveBlending, depthWrite: false, fog: false, transparent: true }))
    moonGlow.scale.setScalar(22)
    moon.add(moonGlow, moonDisc, ...craters)
    const rand = mulberry32(17)
    const pts: number[] = []
    for (let i = 0; i < 260; i++) pts.push((rand() * 2 - 1) * 1.1, (rand() * 2 - 1) * 1.05, -DEPTH - rand() * 20)
    const starGeo = new BufferGeometry()
    starGeo.setAttribute('position', new Float32BufferAttribute(pts, 3))
    const stars = new Points(starGeo, new PointsMaterial({ color: '#ffffff', size: 2.4, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false }))
    stars.frustumCulled = false
    group.add(stars, sun, moon)
    return { group, sun, moon, stars, discs: [sunDisc, moonDisc, ...craters, sunGlow, moonGlow] }
  }, [])
  useEffect(
    () => () => {
      parts.stars.geometry.dispose()
      for (const m of parts.discs) {
        if (m instanceof Mesh) m.geometry.dispose()
      }
    },
    [parts],
  )
  useFrame(() => {
    const sky = skyOf(source.world)
    const g = parts.group
    g.position.copy(camera.position)
    g.quaternion.copy(camera.quaternion)
    const halfH = DEPTH * Math.tan(((CAMERA_FOV / 2) * Math.PI) / 180)
    const halfW = halfH * (size.width / size.height)
    const clear = Math.max(0, 1 - Math.max(sky.rain, sky.snow, sky.fog) * 1.2)
    const arc = arcOf(sky.time)
    const body = arc.moon ? parts.moon : parts.sun
    const other = arc.moon ? parts.sun : parts.moon
    other.visible = false
    // Low at the ends of its arc, it sinks out of sight.
    const up = Math.sin(Math.PI * arc.k)
    body.visible = clear > 0.02 && up > 0.05
    body.position.set((-0.85 + 1.7 * arc.k) * halfW, (0.5 + 0.38 * up) * halfH, -DEPTH)
    body.scale.setScalar(0.5 * Math.min(1, up * 3))
    for (const m of parts.discs) (m.material as MeshBasicMaterial | SpriteMaterial).opacity = clear
    // Star positions are kept as a share of the view's half sizes.
    parts.stars.scale.set(halfW, halfH, 1)
    const mat = parts.stars.material as PointsMaterial
    mat.opacity = nightOf(sky.time) * clear
    parts.stars.visible = mat.opacity > 0.01
  })
  return <primitive object={parts.group} />
}

const RAIN = 700
const SNOW = 600
const scratch = new Object3D()

/** Rain and snow falling round the middle of the view, as many drops as it falls hard, leaning and drifting with the wind. */
export function Weather({ source, aim, clock }: { source: SceneSource; aim: Vector3; clock: Clock }) {
  const parts = useMemo(() => {
    const rain = new InstancedMesh(new BoxGeometry(0.014, 0.42, 0.014), new MeshBasicMaterial({ color: colorOf('#d4ebff'), transparent: true, opacity: 0.6, depthWrite: false }), RAIN)
    const snow = new InstancedMesh(new OctahedronGeometry(0.055), new MeshBasicMaterial({ color: '#ffffff' }), SNOW)
    for (const m of [rain, snow]) {
      m.count = 0
      m.frustumCulled = false
    }
    const rand = mulberry32(23)
    const seeds = Array.from({ length: Math.max(RAIN, SNOW) }, () => [rand() * 2 - 1, rand() * 2 - 1, rand()] as const)
    return { rain, snow, seeds }
  }, [])
  useEffect(
    () => () => {
      for (const m of [parts.rain, parts.snow]) {
        m.geometry.dispose()
        m.dispose()
      }
    },
    [parts],
  )
  useFrame(() => {
    const sky = skyOf(source.world)
    const t = clock.t
    const wind = sky.wind
    const R = 17
    const rain = Math.round(RAIN * sky.rain)
    for (let i = 0; i < rain; i++) {
      const [sx, sz, sy] = parts.seeds[i]!
      const k = (((sy - t * 0.9) % 1) + 1) % 1
      scratch.position.set(aim.x + sx * R + wind * 3 * k, k * 15, aim.z + sz * R)
      scratch.rotation.set(0, 0, wind * 0.5)
      scratch.scale.setScalar(1)
      scratch.updateMatrix()
      parts.rain.setMatrixAt(i, scratch.matrix)
    }
    parts.rain.count = rain
    if (rain > 0) parts.rain.instanceMatrix.needsUpdate = true
    const snow = Math.round(SNOW * sky.snow)
    for (let i = 0; i < snow; i++) {
      const [sx, sz, sy] = parts.seeds[i]!
      const k = (((sy - t * 0.075) % 1) + 1) % 1
      scratch.position.set(aim.x + sx * R + 0.35 * Math.sin(t * 1.3 + sy * 40) + wind * 4 * k, k * 12, aim.z + sz * R + 0.3 * Math.cos(t * 1.1 + sx * 30))
      scratch.rotation.set(t + sy * 9, t * 0.7 + sx * 5, 0)
      scratch.scale.setScalar(1)
      scratch.updateMatrix()
      parts.snow.setMatrixAt(i, scratch.matrix)
    }
    parts.snow.count = snow
    if (snow > 0) parts.snow.instanceMatrix.needsUpdate = true
  })
  return (
    <>
      <primitive object={parts.rain} />
      <primitive object={parts.snow} />
    </>
  )
}

/** Where lamps come from each frame: the things and the bodies that give light. */
export interface LampSources {
  readonly lamps: Lamp[]
}

/**
 * A few real lights for the lamps nearest the middle of the view (pickLamps), and a soft halo
 * round many more. The lights are all shown or all hidden together, so three.js's shaders are
 * built for one count of lights and stay built: hidden while nothing gives light (most days).
 */
export function Lamps({ from, aim, source }: { from: LampSources[]; aim: Vector3; source: SceneSource }) {
  const parts = useMemo(() => {
    const group = new Group()
    const lights = Array.from({ length: LAMP_LIGHTS }, () => {
      const l = new PointLight('#ffffff', 0, 7, 2)
      l.castShadow = false
      group.add(l)
      return l
    })
    const map = glowTexture()
    const halos = Array.from({ length: HALOS }, () => {
      const s = new Sprite(new SpriteMaterial({ map, blending: AdditiveBlending, depthWrite: false, transparent: true }))
      s.visible = false
      group.add(s)
      return s
    })
    return { group, lights, halos, map, since: -Infinity }
  }, [])
  useEffect(
    () => () => {
      parts.map.dispose()
      for (const h of parts.halos) h.material.dispose()
    },
    [parts],
  )
  const all = useMemo<Lamp[]>(() => [], [])
  useFrame(() => {
    all.length = 0
    for (const f of from) all.push(...f.lamps)
    const night = nightOf(skyOf(source.world).time)
    const lit = pickLamps(all, aim, LAMP_LIGHTS)
    // On while anything gives light, and a second after, so a flickering fire does not switch the shaders back and forth.
    const t = performance.now()
    if (lit.length > 0) parts.since = t
    const on = t - parts.since < 1000
    parts.lights.forEach((l, i) => {
      l.visible = on
      const lamp = lit[i]
      if (lamp === undefined) {
        l.intensity = 0
        return
      }
      l.position.set(lamp.x, lamp.y, lamp.z)
      l.color.set(colorOf(lamp.color))
      // About as bright on the ground under it however high it is: a lantern up a post, a glowing kid, a torch in a hand.
      l.intensity = 9 * lamp.strength * Math.min(1, Math.max(0.1, (lamp.y / 3) ** 2))
    })
    const glows = pickLamps(all, aim, HALOS)
    parts.halos.forEach((h, i) => {
      const lamp = glows[i]
      h.visible = lamp !== undefined
      if (lamp === undefined) return
      h.position.set(lamp.x, lamp.y, lamp.z)
      h.material.color.set(colorOf(lamp.color))
      h.material.opacity = Math.min(1, lamp.strength) * (0.25 + 0.6 * night)
      h.scale.setScalar(1.1 + 0.6 * lamp.strength)
    })
  })
  return <primitive object={parts.group} />
}
