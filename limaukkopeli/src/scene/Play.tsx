import { PerspectiveCamera } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Vector3, type DirectionalLight, type PerspectiveCamera as Camera } from 'three'

import { useLook, type Game } from '../game/game'
import { clamp, ease } from '../game/math'
import { BOX_X, POLE_X, TOWER_HALF, type Sim } from '../game/model'
import { Effects } from './Effects'
import { THEMES, type Theme } from './look'
import { Obstacles } from './Obstacles'
import { Pickups } from './Pickups'
import { WATER_Y } from './place'
import { Sky } from './Sky'
import { PlayerSlime } from './Slime'
import { Tower } from './Tower'
import { Track } from './Track'

const DEG = Math.PI / 180

/**
 * A run: the camera, the light, the sky, the course and its obstacles, the balls and the
 * babies, the slime, the tower and the effects. Keyed by the run in the stage, so a new
 * run mounts it afresh with nothing left over from the last one.
 */
export function Play({ game }: { game: Game }) {
  const sim = game.sim
  const theme = THEMES[sim.course.id]
  // What the camera looks at, in three's space: the sun's shadow box follows it.
  const focus = useMemo(() => new Vector3(), [])
  return (
    <>
      <PlayCamera sim={sim} focus={focus} />
      <Lights theme={theme} focus={focus} />
      <Sky sim={sim} theme={theme} />
      <Track sim={sim} theme={theme} />
      <Obstacles sim={sim} theme={theme} />
      <Dressed game={game} sim={sim} />
      <Tower sim={sim} theme={theme} />
      <Effects sim={sim} theme={theme} />
    </>
  )
}

/** The things that wear the slime's look: only they re-render when the look changes (the gift going on). */
function Dressed({ game, sim }: { game: Game; sim: Sim }) {
  const look = useLook(game)
  return (
    <>
      <Pickups sim={sim} look={look} />
      <PlayerSlime sim={sim} look={look} />
    </>
  )
}

// ------------------------------------------------------------------ the camera

/**
 * The lens for a screen of this shape: 50 degrees tall on a wide screen; on a narrow one
 * it opens up to 68 degrees and then stands further back (`back`), so the track's width
 * always fits across.
 */
function lens(aspect: number) {
  const halfW = Math.atan(Math.tan(25 * DEG) * 1.3)
  const halfV = clamp(Math.atan(Math.tan(halfW) / aspect), 25 * DEG, 34 * DEG)
  return { aspect, fov: (2 * halfV) / DEG, halfV, back: Math.max(1, Math.tan(halfW) / (Math.tan(halfV) * aspect)) }
}
type Lens = ReturnType<typeof lens>

/**
 * Where the camera wants to be: it looks at a focus point from `dist` away, turned
 * `yaw` round from straight behind (the sim's -z side; positive swings it to +x) and
 * raised `pitch` above level (negative looks up). Each value eases toward its target
 * with its own time constant, in real seconds.
 */
interface Aim {
  fx: number
  fy: number
  fz: number
  yaw: number
  pitch: number
  dist: number
  /** Time constants: across, up, along, and the rest (yaw, pitch, distance). */
  tx: number
  ty: number
  tz: number
  tr: number
}

/** Sets `out` to the framing the run's phase asks for, through lens L. */
function frame(sim: Sim, L: Lens, out: Aim) {
  const s = sim.slime
  const r = s.r
  switch (sim.phase) {
    case 'ready':
      // A close look at the slime's face from in front, a little to its right; Go swings the camera round behind it.
      out.fx = s.x
      out.fy = s.y + 1.5 * r
      out.fz = s.z
      out.yaw = 0.82 * Math.PI
      out.pitch = 0.2
      out.dist = (2.6 + 4 * r) * L.back
      out.tx = out.ty = out.tz = out.tr = 0.4
      return
    case 'run': {
      // Behind and above, further back and higher as it grows, looking a little ahead of it; closer and lower while the game teaches.
      const teach = sim.teach !== null ? 1 : 0
      const back = (3.2 + 5.4 * r) * (1 - 0.25 * teach)
      const high = (2 + 4.4 * r) * (1 - 0.3 * teach)
      const ahead = (3.5 + 2.6 * r) * (1 - 0.3 * teach)
      const low = 0.6 * r
      out.fx = 0.7 * s.x
      out.fy = low + 0.45 * Math.max(0, s.y)
      out.fz = s.z + ahead
      out.yaw = 0
      out.pitch = Math.atan2(high - low, back + ahead)
      out.dist = Math.hypot(back + ahead, high - low) * L.back
      out.tx = 0.45
      out.ty = 0.5
      out.tz = 0.12
      out.tr = 0.6
      return
    }
    case 'splash':
      // Watches it bob in the water, then follows the fish's spit back to the flag, from a little higher.
      out.fx = 0.7 * s.x
      out.fy = Math.max(s.y, WATER_Y) + 1.2 * r
      out.fz = s.z + 2
      out.yaw = 0
      out.pitch = 0.42
      out.dist = (8.5 + 7 * r) * L.back
      out.tx = 0.5
      out.ty = 0.4
      out.tz = 0.3
      out.tr = 0.7
      return
    case 'finish':
      // Swings a little to the left to show the measuring pole on the right beside the slime (the arch's balloons are flying off by now).
      out.fx = (s.x + POLE_X + 0.8) / 2
      out.fy = 1.3 + 0.28 * s.size
      out.fz = s.z + 0.6
      out.yaw = -0.3
      out.pitch = 0.14
      out.dist = (5.6 + 2.6 * r) * L.back
      out.tx = out.ty = out.tr = 0.55
      out.tz = 0.3
      return
    case 'tower':
    case 'fall': {
      // Side on to the shaft from the course's side, a little below, so the circles above show in time; the whole width always fits.
      const halfW = Math.atan(Math.tan(L.halfV) * L.aspect)
      out.fx = 0.35 * s.x
      out.fy = s.y + 4.2
      out.fz = sim.tower.z
      out.yaw = 0
      out.pitch = -0.12
      out.dist = Math.max((TOWER_HALF + 1.4) / Math.tan(halfW), 6.2 / Math.tan(L.halfV), 11)
      out.tx = 0.6
      out.ty = 0.22
      out.tz = 0.5
      out.tr = 0.7
      return
    }
    case 'top':
    case 'done':
      // The slime and the box from a little above the front, swaying gently once it is all done.
      out.fx = BOX_X * 0.45
      out.fy = s.y + 0.9 + 0.4 * r
      out.fz = sim.tower.z
      out.yaw = sim.phase === 'done' ? 0.22 * Math.sin(sim.time * 0.25) : 0
      out.pitch = 0.3
      out.dist = (7 + 2.4 * r) * L.back
      out.tx = out.ty = out.tz = out.tr = 0.6
      return
  }
}

/** A short shake when a big slime bounces, a paddle hits it, it bonks a circle or splashes in: the latest of them decides how hard. */
function shakeOf(sim: Sim) {
  const s = sim.slime
  const t = sim.time
  let amp = 0
  let age = Infinity
  for (let i = 0; i < 4; i++) {
    const at = i === 0 ? s.bounceAt : i === 1 ? s.hitAt : i === 2 ? sim.tower.bonkAt : s.splashAt
    if (at < 0 || t < at || t - at >= age) continue
    age = t - at
    amp = i === 0 ? 0.06 * s.size : i === 1 ? 0.08 : i === 2 ? 0.06 : 0.05
  }
  return age < 0.4 ? amp * Math.exp(-age * 9) : 0
}

/**
 * The run's camera: one eased orbit round a focus point, so every change of view is a
 * smooth swing, from the close look at the start round behind the slime, in a little
 * while teaching, out over a splash, aside at the measuring pole, side on up the tower
 * and in on the box at the top.
 */
function PlayCamera({ sim, focus }: { sim: Sim; focus: Vector3 }) {
  const camera = useRef<Camera>(null!)
  const size = useThree((s) => s.size)
  const L = useMemo(() => lens(size.width / size.height), [size])
  const target = useMemo<Aim>(() => ({ fx: 0, fy: 0, fz: 0, yaw: 0, pitch: 0, dist: 10, tx: 1, ty: 1, tz: 1, tr: 1 }), [])
  const now = useRef({ fx: 0, fy: 0, fz: 0, yaw: 0, pitch: 0, dist: 10, primed: false })
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1)
    frame(sim, L, target)
    const c = now.current
    if (!c.primed) {
      c.fx = target.fx
      c.fy = target.fy
      c.fz = target.fz
      c.yaw = target.yaw
      c.pitch = target.pitch
      c.dist = target.dist
      c.primed = true
    } else {
      c.fx = ease(c.fx, target.fx, dt, target.tx)
      c.fy = ease(c.fy, target.fy, dt, target.ty)
      c.fz = ease(c.fz, target.fz, dt, target.tz)
      c.yaw = ease(c.yaw, target.yaw, dt, target.tr)
      c.pitch = ease(c.pitch, target.pitch, dt, target.tr)
      c.dist = ease(c.dist, target.dist, dt, target.tr)
    }
    const flat = Math.cos(c.pitch) * c.dist
    const shake = shakeOf(sim)
    const t = sim.time
    const cam = camera.current
    // Sim (x, y, z) is three's (x, y, -z).
    cam.position.set(c.fx + Math.sin(c.yaw) * flat + shake * 0.6 * Math.sin(t * 47), c.fy + Math.sin(c.pitch) * c.dist + shake * Math.sin(t * 55), -(c.fz - Math.cos(c.yaw) * flat))
    focus.set(c.fx, c.fy, -c.fz)
    cam.lookAt(focus)
    if (Math.abs(cam.fov - L.fov) > 0.01) {
      cam.fov = L.fov
      cam.updateProjectionMatrix()
    }
  })
  return <PerspectiveCamera ref={camera} makeDefault fov={50} near={0.3} far={1200} />
}

// ------------------------------------------------------------------ the light

/**
 * The sun comes from behind the camera, high and a little to the right, so shadows fall
 * short and ahead of things where a child sees them (a jump's shadow shows where it will
 * land). Its shadow box follows the camera's focus.
 */
const SUN_FROM = new Vector3(9, 22, 12)
const SHADOW_BOX = 16

/** One warm sun (the cool moon on Star Night) with soft shadows, and the island's sky fill. */
function Lights({ theme, focus }: { theme: Theme; focus: Vector3 }) {
  const sun = useRef<DirectionalLight>(null!)
  useFrame(() => {
    const s = sun.current
    s.position.copy(focus).add(SUN_FROM)
    s.target.position.copy(focus)
    s.target.updateMatrixWorld()
  })
  return (
    <>
      <hemisphereLight args={[theme.fillSky, theme.fillGround, theme.fillIntensity]} />
      <directionalLight
        ref={sun}
        color={theme.sun}
        intensity={theme.sunIntensity}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
        shadow-radius={3}
        shadow-camera-left={-SHADOW_BOX}
        shadow-camera-right={SHADOW_BOX}
        shadow-camera-top={SHADOW_BOX}
        shadow-camera-bottom={-SHADOW_BOX}
        shadow-camera-near={1}
        shadow-camera-far={90}
      />
    </>
  )
}
