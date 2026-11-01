import { Html, PerspectiveCamera } from '@react-three/drei'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Fog,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  RingGeometry,
  Shape,
  TorusGeometry,
  Vector2,
  Vector3,
  type PerspectiveCamera as PerspectiveCameraObject,
} from 'three'

import { BABY_COLOURS, type SlimeLook } from '../game/closet'
import { HOP_FOR, useLook, type Game } from '../game/game'
import { clamp, clamp01, ease, easeAngle, lerp, mod, smoothstep } from '../game/math'
import { COURSE_IDS } from '../game/model'
import { isOpen } from '../game/progress'
import { AnimalIcon } from '../Icons'
import { palette } from './look'
import { BABY_SPOTS, BEAD, Bridges, ISLAND_AT, ISLAND_R, IslandArt, SEA_DEEP, SLIME_SPOT, SPHERE, Sea, groundY, softDisc } from './MapIslands'
import { BabySlime, IdleSlime } from './Slime'

/**
 * The map: the five islands in their sunny sea (MapIslands.tsx), a sleepy cloud over every
 * island not open yet, the slime on the chosen island hopping from island to island, the
 * babies found on each island bouncing there, a badge over every open island with the
 * biggest animal measured there and the babies found, and its own camera and lights. A tap
 * on an island (or its cloud) chooses it, and a tap on the chosen one plays it.
 */

/** What the camera works out each frame for everything that turns toward it: its yaw and pitch, and its turn. */
interface View {
  yaw: number
  pitch: number
  quaternion: Quaternion
}

/** The camera's lens, and how steeply it looks down across the row and along it. */
const FOV = 36
const TAN_V = Math.tan(((FOV / 2) * Math.PI) / 180)
const PITCH_WIDE = 0.92
const PITCH_TALL = 1.04
/** The badges float this high over their island, clear of its tallest landmark, a tail pointing down to it. */
const BADGE_Y = 5.4
/** How far the frame leans toward the chosen island, as a share of the room it has to lean in; the fit leaves SLACK of the window for it. */
const LEAN = 0.4
const SLACK = 0.93
/** The slime and the babies on the map, as scales of IdleSlime (a body of radius 1) and BabySlime (a third of the starting slime). */
const SLIME_SCALE = 0.62
const BABY_SCALE = 1.85
/** A sleepy cloud floats this high over its island; a cloud whose island has just opened wakes and floats away over LIFT_FOR, LIFT_AFTER after the map shows. */
const CLOUD_H = 2.7
const LIFT_AFTER = 0.3
const LIFT_FOR = 1.9
/** The friendly fish jumps once every FISH_EVERY seconds, for FISH_JUMP. */
const FISH_EVERY = 5.5
const FISH_JUMP = 0.95

// ------------------------------------------------------------------ what the map shows

/** What an island shows, read from the save when the map appears (the save does not change while the map is up). */
interface IslandView {
  open: boolean
  /** Open now but locked the last time the map showed: its cloud wakes up and floats away. */
  lifting: boolean
  babies: readonly [boolean, boolean, boolean]
  best: number
}

/** Which islands each game's map showed open last, so an island that has opened since gets its cloud lifted. */
const shownOpen = new WeakMap<Game, readonly boolean[]>()

function useIslands(game: Game) {
  const [islands] = useState(() => {
    const before = shownOpen.get(game)
    return COURSE_IDS.map((id, i): IslandView => {
      const open = isOpen(game.save, i)
      return { open, lifting: open && before !== undefined && !before[i], babies: game.save.babies[id], best: game.save.best[id] }
    })
  })
  useEffect(() => {
    shownOpen.set(
      game,
      islands.map((s) => s.open),
    )
  }, [game, islands])
  return islands
}

// ------------------------------------------------------------------ the camera

/** The part of the screen the HUD leaves free, as how far up, down, left and right of the middle it reaches (1 is the screen's edge). */
const free = { top: 1, bottom: 1, left: 1, right: 1 }

/**
 * The map HUD's own sizes (map.css, all from the screen's short side): the title along the
 * top, the arrows at the sides, the name and Go! along the bottom. The islands and their
 * badges keep inside what is left.
 */
function freeWindow(w: number, h: number) {
  const vmin = Math.min(w, h) / 100
  const m = clamp(2 * vmin, 8, 18)
  const top = m + clamp(4.6 * vmin, 22, 40) * 1.3 + 6
  const side = m + clamp(12 * vmin, 58, 92) + 14
  const bottom = m + clamp(13 * vmin, 64, 106) + clamp(5.4 * vmin, 22, 46) * 1.35 + 12
  free.top = Math.max(0.2, 1 - (2 * top) / h)
  free.bottom = Math.max(0.15, 1 - (2 * bottom) / h)
  free.left = Math.max(0.3, 1 - (2 * side) / w)
  free.right = free.left
  return free
}

/** The camera's right, up and forward; the free window's slopes (how far out it reaches per unit ahead); the running minimums of the fit (tight: with SLACK; then with the full window). */
const basis = { rx: 0, rz: 0, ux: 0, uy: 0, uz: 0, fx: 0, fy: 0, fz: 0 }
const slope = { r: 0, l: 0, t: 0, b: 0 }
const fit = { a: 0, b: 0, e: 0, g: 0, at: 0, bt: 0, et: 0, gt: 0 }

/**
 * One ball of radius rho that must stay in the window: in the camera's frame (x right, y up,
 * z ahead) the camera at (cx, cy, cz) sees it if x - cx + rho <= kR (z - cz), and the same
 * for the left, the top and the bottom. Each side's bound on cz then reads cz <= a + cx / kR
 * with a the least z - (x + rho) / kR over the balls (and so on for b, e and g).
 */
function fitBall(px: number, py: number, pz: number, rho: number) {
  const x = px * basis.rx + pz * basis.rz
  const y = px * basis.ux + py * basis.uy + pz * basis.uz
  const z = px * basis.fx + py * basis.fy + pz * basis.fz
  fit.a = Math.min(fit.a, z - (x + rho) / slope.r)
  fit.b = Math.min(fit.b, z - (rho - x) / slope.l)
  fit.e = Math.min(fit.e, z - (y + rho) / slope.t)
  fit.g = Math.min(fit.g, z - (rho - y) / slope.b)
  fit.at = Math.min(fit.at, z - (x + rho) / (slope.r * SLACK))
  fit.bt = Math.min(fit.bt, z - (rho - x) / (slope.l * SLACK))
  fit.et = Math.min(fit.et, z - (y + rho) / (slope.t * SLACK))
  fit.gt = Math.min(fit.gt, z - (rho - y) / (slope.b * SLACK))
}

/**
 * Fits every island (its disc's ends across the screen and up it, and its badge) into the
 * free window of a w x h screen for a camera turned `yaw` and looking down `pitch`. Leaves
 * the camera's axes in `basis`, the window in `slope` and the bounds in `fit`, and returns
 * how far along its view the camera stands from the world's middle (cz, negative: behind
 * it), as close as the tight window allows.
 */
function fitFrame(w: number, h: number, yaw: number, pitch: number) {
  const sy = Math.sin(yaw)
  const cy = Math.cos(yaw)
  const sp = Math.sin(pitch)
  const cp = Math.cos(pitch)
  basis.rx = cy
  basis.rz = -sy
  basis.ux = -sy * sp
  basis.uy = cp
  basis.uz = -cy * sp
  basis.fx = -sy * cp
  basis.fy = -sp
  basis.fz = -cy * cp
  const win = freeWindow(w, h)
  const tanH = (TAN_V * w) / h
  slope.r = win.right * tanH
  slope.l = win.left * tanH
  slope.t = win.top * TAN_V
  slope.b = win.bottom * TAN_V
  fit.a = fit.b = fit.e = fit.g = fit.at = fit.bt = fit.et = fit.gt = Infinity
  for (let i = 0; i < ISLAND_AT.length; i++) {
    const p = ISLAND_AT[i]!
    fitBall(p.x + cy * ISLAND_R, 0.3, p.z - sy * ISLAND_R, 0.3)
    fitBall(p.x - cy * ISLAND_R, 0.3, p.z + sy * ISLAND_R, 0.3)
    fitBall(p.x - sy * ISLAND_R, 0.3, p.z - cy * ISLAND_R, 0.3)
    fitBall(p.x + sy * ISLAND_R, 0.3, p.z + cy * ISLAND_R, 0.3)
    fitBall(p.x, BADGE_Y, p.z, 0.9)
  }
  const iR = 1 / (slope.r * SLACK)
  const iL = 1 / (slope.l * SLACK)
  const iT = 1 / (slope.t * SLACK)
  const iB = 1 / (slope.b * SLACK)
  const cx = (fit.bt - fit.at) / (iR + iL)
  const cyTight = (fit.gt - fit.et) / (iT + iB)
  return Math.min(fit.at + cx * iR, fit.et + cyTight * iT)
}

/** The camera looks down more steeply the more it looks along the row. */
const pitchFor = (yaw: number) => lerp(PITCH_WIDE, PITCH_TALL, clamp01(-yaw / (Math.PI / 2)))

/** The yaw that shows the islands biggest on a w x h screen, in 5 degree steps from looking across the row (0) to looking along it (-90 degrees). */
function bestYaw(w: number, h: number) {
  let best = 0
  let closest = -Infinity
  for (let deg = 0; deg >= -90; deg -= 5) {
    const yaw = (deg * Math.PI) / 180
    const cz = fitFrame(w, h, yaw, pitchFor(yaw))
    if (cz > closest + 1e-6) {
      closest = cz
      best = yaw
    }
  }
  return best
}

/**
 * A high angled view that keeps every island and badge inside the part of the screen the
 * HUD leaves free, on any shape of screen, turned whichever way shows the islands biggest:
 * across the row on a wide screen, corner to corner on an iPad, along the row on a tall
 * phone, so the park is nearest and the night furthest. The camera stands as close as the
 * fit allows, then leans toward the chosen island within the room the fit has left. It
 * eases everywhere (a turned screen swings it round), and comes in from a little closer when
 * the map appears.
 */
function MapCamera({ game, view, fog }: { game: Game; view: View; fog: Fog }) {
  const camera = useRef<PerspectiveCameraObject>(null!)
  const size = useThree((s) => s.size)
  const rig = useMemo(() => ({ first: true, w: 0, h: 0, target: 0, yaw: 0, pos: new Vector3(), want: new Vector3(), look: new Vector3() }), [])
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1)
    if (size.width !== rig.w || size.height !== rig.h) {
      rig.w = size.width
      rig.h = size.height
      rig.target = bestYaw(rig.w, rig.h)
    }
    rig.yaw = rig.first ? rig.target : ease(rig.yaw, rig.target, dt, 0.5)
    const pitch = pitchFor(rig.yaw)
    const cz = fitFrame(rig.w, rig.h, rig.yaw, pitch)
    // The room to lean in, in the full window; then where the chosen island would sit in its middle.
    const xLo = slope.r * (cz - fit.a)
    const xHi = slope.l * (fit.b - cz)
    const yLo = slope.t * (cz - fit.e)
    const yHi = slope.b * (fit.g - cz)
    const chosen = ISLAND_AT[game.index]!
    const xc = chosen.x * basis.rx + chosen.z * basis.rz
    const yc = chosen.x * basis.ux + 0.5 * basis.uy + chosen.z * basis.uz
    const zc = chosen.x * basis.fx + 0.5 * basis.fy + chosen.z * basis.fz
    const xMid = xc - ((slope.r - slope.l) / 2) * (zc - cz)
    const yMid = yc - ((slope.t - slope.b) / 2) * (zc - cz)
    const cx = clamp(lerp((xLo + xHi) / 2, xMid, LEAN), xLo, xHi)
    const cy = clamp(lerp((yLo + yHi) / 2, yMid, LEAN), yLo, yHi)
    rig.want.set(cx * basis.rx + cy * basis.ux + cz * basis.fx, cy * basis.uy + cz * basis.fy, cx * basis.rz + cy * basis.uz + cz * basis.fz)
    const dist = -cz
    if (rig.first) {
      rig.pos.set(rig.want.x + basis.fx * dist * 0.16, rig.want.y + basis.fy * dist * 0.16, rig.want.z + basis.fz * dist * 0.16)
      rig.first = false
    } else {
      rig.pos.x = ease(rig.pos.x, rig.want.x, dt, 0.45)
      rig.pos.y = ease(rig.pos.y, rig.want.y, dt, 0.45)
      rig.pos.z = ease(rig.pos.z, rig.want.z, dt, 0.45)
    }
    const c = camera.current
    c.position.copy(rig.pos)
    rig.look.set(rig.pos.x + basis.fx, rig.pos.y + basis.fy, rig.pos.z + basis.fz)
    c.lookAt(rig.look)
    c.updateMatrixWorld()
    view.yaw = rig.yaw
    view.pitch = pitch
    view.quaternion.copy(c.quaternion)
    fog.near = dist * 1.3
    fog.far = dist * 3
  }, -0.5)
  return <PerspectiveCamera ref={camera} makeDefault fov={FOV} near={0.5} far={600} />
}

/** One warm sun from the front left with soft shadows over every island, and a sky fill from above and the sea's glow from below. */
function MapLights() {
  return (
    <>
      <hemisphereLight args={['#d6efff', '#3fb0cf', 1.05]} />
      <directionalLight
        position={[-14, 26, 16]}
        intensity={2.5}
        color="#fff3dc"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
        shadow-camera-left={-27}
        shadow-camera-right={27}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
        shadow-camera-near={1}
        shadow-camera-far={90}
      />
    </>
  )
}

// ------------------------------------------------------------------ the slime and the babies

/** Where the slime stands on island i, into `out`. */
function slimeSpot(i: number, out: Vector3) {
  const p = ISLAND_AT[i]
  if (p === undefined) throw new Error(`no island ${i}`)
  return out.set(p.x + SLIME_SPOT[0], SLIME_SPOT[1], p.z + SLIME_SPOT[2])
}

/** The ground under (x, z): an island's top, or the sea. */
function groundUnder(x: number, z: number) {
  for (const p of ISLAND_AT) {
    const rho = Math.hypot(x - p.x, z - p.z)
    if (rho < ISLAND_R) return groundY(rho)
  }
  return 0.02
}

const BLOB = new CircleGeometry(1, 32).rotateX(-Math.PI / 2)
const PUFF_RING = new RingGeometry(0.75, 1, 40).rotateX(-Math.PI / 2)

/**
 * The slime on the chosen island, facing the camera. A hop flies it along an arc to the
 * next island over HOP_FOR, stretched in the air and turned the way it goes, and lands it
 * with a squash, a puff and a happy wiggle. A new hop that starts mid-air starts from where
 * it is. A soft round shadow stays under it all the way.
 */
function MapSlime({ game, look, view, clock }: { game: Game; look: SlimeLook; view: View; clock: () => number }) {
  const outer = useRef<Group>(null!)
  const body = useRef<Group>(null!)
  const shadow = useRef<Mesh>(null!)
  const puff = useRef<Mesh>(null!)
  const mats = useMemo(
    () => ({
      shadow: new MeshBasicMaterial({ color: palette.ink, transparent: true, opacity: 0.3, alphaMap: softDisc(), depthWrite: false }),
      puff: new MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false }),
    }),
    [],
  )
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats])
  const hop = useMemo(() => ({ at: Number.NaN, from: new Vector3(), to: new Vector3(), pos: new Vector3(), yaw: 0, flying: false, happy: true, happyUntil: game.clock + 1.6 }), [game])
  const [happy, setHappy] = useState(true)
  useFrame((_, delta) => {
    const t = game.clock
    const dt = Math.min(delta, 0.1)
    if (game.hopAt !== hop.at) {
      if (Number.isNaN(hop.at)) {
        slimeSpot(game.hopFrom, hop.from)
        hop.yaw = view.yaw
      } else hop.from.copy(hop.pos)
      hop.at = game.hopAt
    }
    slimeSpot(game.index, hop.to)
    const k = game.hopAt < 0 ? 1 : clamp01((t - game.hopAt) / HOP_FOR)
    const flying = k < 1
    let stretch = 1
    if (flying) {
      const d = Math.hypot(hop.to.x - hop.from.x, hop.to.z - hop.from.z)
      hop.pos.lerpVectors(hop.from, hop.to, k)
      hop.pos.y += (1.1 + 0.16 * d) * 4 * k * (1 - k)
      stretch = 1 + 0.2 * Math.abs(1 - 2 * k)
      hop.yaw = easeAngle(hop.yaw, Math.atan2(hop.to.x - hop.from.x, hop.to.z - hop.from.z), dt, 0.07)
    } else {
      hop.pos.copy(hop.to)
      const since = t - (game.hopAt + HOP_FOR)
      if (game.hopAt >= 0 && since < 0.8) stretch = 1 - 0.24 * Math.exp(-since * 6) * Math.cos(since * 19)
      hop.yaw = easeAngle(hop.yaw, view.yaw, dt, 0.25)
      if (hop.flying) hop.happyUntil = t + 1.5
    }
    hop.flying = flying
    const wantHappy = !flying && t < hop.happyUntil
    if (wantHappy !== hop.happy) {
      hop.happy = wantHappy
      setHappy(wantHappy)
    }
    outer.current.position.copy(hop.pos)
    outer.current.rotation.y = hop.yaw
    body.current.scale.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch))
    const ground = groundUnder(hop.pos.x, hop.pos.z)
    const height = Math.max(0, hop.pos.y - ground)
    shadow.current.position.set(hop.pos.x, ground + 0.02, hop.pos.z)
    shadow.current.scale.setScalar(SLIME_SCALE * 1.05 * (1 - 0.35 * clamp01(height / 3)))
    mats.shadow.opacity = 0.32 * (1 - 0.5 * clamp01(height / 3))
    const since = game.hopAt < 0 ? 99 : t - (game.hopAt + HOP_FOR)
    puff.current.visible = since >= 0 && since < 0.45
    if (puff.current.visible) {
      const p = since / 0.45
      puff.current.position.set(hop.pos.x, ground + 0.04, hop.pos.z)
      puff.current.scale.setScalar(SLIME_SCALE * (1 + 1.4 * p))
      mats.puff.opacity = 0.8 * (1 - p)
    }
  })
  return (
    <>
      <group ref={outer}>
        <group ref={body}>
          <group scale={SLIME_SCALE}>
            <IdleSlime look={look} clock={clock} happy={happy} />
          </group>
        </group>
      </group>
      <mesh ref={shadow} geometry={BLOB} material={mats.shadow} renderOrder={4} />
      <mesh ref={puff} geometry={PUFF_RING} material={mats.puff} renderOrder={4} />
    </>
  )
}

/** The babies on the slime's island cheer this long when it lands there, and when the map opens on it. */
const CHEER_FOR = 2.2

/**
 * A baby found on an island, facing the camera: it hops gently on its spot, slow and a
 * little squashed at each landing; when the slime lands on its island (or the map opens
 * there) it cheers, hopping fast and waving both arms.
 */
function MapBaby({ game, island, baby, view, clock, shownAt }: { game: Game; island: number; baby: 0 | 1 | 2; view: View; clock: () => number; shownAt: number }) {
  const group = useRef<Group>(null!)
  const p = ISLAND_AT[island]!
  const spot = BABY_SPOTS[baby]
  const [cheering, setCheering] = useState(false)
  const now = useMemo(() => ({ cheering: false }), [])
  useFrame(() => {
    const t = game.clock
    const here = game.index === island
    const landed = game.hopAt < 0 ? t - shownAt : t - Math.max(shownAt, game.hopAt + HOP_FOR)
    const cheer = here && landed >= 0 && landed < CHEER_FOR
    if (cheer !== now.cheering) {
      now.cheering = cheer
      setCheering(cheer)
    }
    const g = group.current
    g.rotation.y = view.yaw
    // Cheering, BabySlime hops by itself; otherwise a slow hop of its own.
    const bounce = cheer ? 0 : Math.abs(Math.sin(t * 2.4 + baby * 2.1 + island * 0.7))
    g.position.y = spot[1] + 0.12 * bounce
    const squash = bounce < 0.12 ? 1 - (0.12 - bounce) * 1.5 : 1
    g.scale.set(BABY_SCALE / Math.sqrt(squash), BABY_SCALE * squash, BABY_SCALE / Math.sqrt(squash))
  })
  return (
    <group ref={group} position={[p.x + spot[0], spot[1], p.z + spot[2]]}>
      <BabySlime index={baby} clock={clock} wave={cheering} />
    </group>
  )
}

/**
 * A ring of light on the water round the chosen island. When the slime hops it fades away
 * from the island it leaves, and grows in round the new one as the slime lands there.
 */
function ChosenRing({ game }: { game: Game }) {
  const ring = useRef<Mesh>(null!)
  const material = useMemo(() => new MeshBasicMaterial({ color: '#fff6c8', transparent: true, depthWrite: false }), [])
  useEffect(() => () => material.dispose(), [material])
  const shown = useMemo(() => ({ index: game.index, light: 1 }), [game])
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1)
    const t = game.clock
    const landing = game.hopAt < 0 || t >= game.hopAt + HOP_FOR * 0.8
    if (shown.index !== game.index && shown.light < 0.03) shown.index = game.index
    shown.light = ease(shown.light, shown.index === game.index && landing ? 1 : 0, dt, 0.12)
    const p = ISLAND_AT[shown.index]!
    ring.current.position.set(p.x, 0.07, p.z)
    ring.current.scale.setScalar((0.88 + 0.12 * shown.light) * (1 + 0.025 * Math.sin(t * 3.2)))
    material.opacity = shown.light * (0.8 + 0.2 * Math.sin(t * 3.2))
  })
  return <mesh ref={ring} geometry={CHOSEN_RING} material={material} renderOrder={3} />
}
const CHOSEN_RING = new TorusGeometry(ISLAND_R + 0.5, 0.15, 10, 96).rotateX(Math.PI / 2)

// ------------------------------------------------------------------ the clouds

/** A cloud's puffs, cloud-local (x across the screen, y up it, z toward the camera) as (x, y, z, radius); squashed to 0.85 high. */
const PUFFS: readonly (readonly [number, number, number, number])[] = [
  [0, 0.15, 0, 1.45],
  [-1.35, -0.15, 0.1, 1.1],
  [1.4, -0.1, 0.05, 1.15],
  [-0.62, 0.72, -0.25, 1.0],
  [0.72, 0.62, -0.3, 0.98],
  [-2.25, -0.42, -0.1, 0.72],
  [2.3, -0.4, -0.12, 0.75],
  [0, -0.55, 0.45, 1.0],
]
const PUFF_SQUASH = 0.85
/** How far toward the camera the cloud's front is at (x, y): where its face sits. */
function cloudFront(x: number, y: number) {
  let front = 0
  for (const [px, py, pz, r] of PUFFS) {
    const dy = (y - py * PUFF_SQUASH) / (r * PUFF_SQUASH)
    const dx = (x - px) / r
    const inside = 1 - dx * dx - dy * dy
    if (inside > 0) front = Math.max(front, pz + r * Math.sqrt(inside))
  }
  return front
}
const EYE_ARC = new TorusGeometry(0.22, 0.065, 8, 20, Math.PI)
const MOUTH_ARC = new TorusGeometry(0.16, 0.055, 8, 16, Math.PI)
/** A "z" floating up from a sleeping cloud. */
const ZED = new ExtrudeGeometry(
  new Shape(
    (
      [
        [-0.5, 0.5],
        [0.5, 0.5],
        [0.5, 0.3],
        [-0.15, -0.3],
        [0.5, -0.3],
        [0.5, -0.5],
        [-0.5, -0.5],
        [-0.5, -0.3],
        [0.15, 0.3],
        [-0.5, 0.3],
      ] as const
    ).map(([x, y]) => new Vector2(x, y)),
  ),
  { depth: 0.08, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2 },
)

/**
 * A soft cloud asleep over an island not open yet, its face turned to the camera, a "z"
 * floating up now and then. Tapped, it opens its eyes and shakes its head. When its island
 * has just opened, it wakes, smiles and floats up and away.
 */
function Cloud({ game, index, lifting, shownAt, view }: { game: Game; index: number; lifting: boolean; shownAt: number; view: View }) {
  const group = useRef<Group>(null!)
  const asleep = useRef<Group>(null!)
  const awake = useRef<Group>(null!)
  const zed = useRef<Mesh>(null!)
  const mats = useMemo(
    () => ({
      puff: new MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, emissive: '#ffffff', emissiveIntensity: 0.1, transparent: lifting }),
      face: new MeshStandardMaterial({ color: palette.ink, roughness: 0.6, transparent: lifting }),
      cheek: new MeshStandardMaterial({ color: palette.blush, roughness: 0.8, transparent: lifting }),
      zed: new MeshBasicMaterial({ color: '#8f7bff', transparent: true, depthWrite: false }),
    }),
    [lifting],
  )
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats])
  const face = useMemo(() => ({ eye: cloudFront(0.55, 0.32), mouth: cloudFront(0, -0.02), cheek: cloudFront(0.95, 0.04) }), [])
  useFrame(() => {
    const t = game.clock
    const p = ISLAND_AT[index]!
    const g = group.current
    let rise = 0
    let fade = 1
    let grow = 1
    let woke = false
    if (lifting) {
      const since = t - shownAt - LIFT_AFTER
      if (since > 0) {
        woke = true
        const k = clamp01(since / LIFT_FOR)
        rise = 7 * k * k
        grow = 1 + 0.4 * smoothstep(0, 1, k)
        fade = 1 - smoothstep(0.35, 1, k)
      }
      g.visible = fade > 0.01
      mats.puff.opacity = fade
      mats.face.opacity = fade
      mats.cheek.opacity = fade
    }
    let shake = 0
    let squash = 0
    const locked = game.locked
    if (locked !== null && locked.index === index) {
      const since = t - locked.at
      if (since >= 0 && since < 1.1) {
        woke = true
        shake = 0.32 * Math.sin(since * 20) * Math.exp(-since * 3)
        squash = 0.1 * Math.sin(since * 15) * Math.exp(-since * 4)
      }
    }
    // Over the island as the camera sees it: as far toward the camera as the cloud is high, so it hides the island.
    const toward = CLOUD_H / Math.tan(view.pitch)
    g.position.set(p.x + Math.sin(view.yaw) * toward, CLOUD_H + rise + 0.1 * Math.sin(t * 1.1 + index), p.z + Math.cos(view.yaw) * toward)
    g.quaternion.copy(view.quaternion)
    g.rotateY(shake)
    const breathe = 1 + 0.02 * Math.sin(t * 1.6 + index)
    g.scale.set(grow * breathe * (1 + squash), grow * breathe * (1 - squash), grow)
    asleep.current.visible = !woke
    awake.current.visible = woke
    const z = mod(t * 0.4 + index * 0.37, 1)
    zed.current.visible = !woke
    zed.current.position.set(1.5 + 0.7 * z, 0.9 + 1.5 * z, 1)
    zed.current.rotation.z = 0.25 - 0.3 * z
    zed.current.scale.setScalar(0.22 + 0.3 * z)
    mats.zed.opacity = smoothstep(0, 0.2, z) * (1 - smoothstep(0.65, 1, z))
  })
  return (
    <group
      ref={group}
      // A cloud floating away belongs to an open island: taps go to the island under it.
      onPointerDown={
        lifting
          ? undefined
          : (e: ThreeEvent<PointerEvent>) => {
              e.stopPropagation()
              game.chooseIsland(index)
            }
      }
    >
      {PUFFS.map(([x, y, z, r]) => (
        <mesh key={`${x},${y}`} geometry={SPHERE} material={mats.puff} position={[x, y * PUFF_SQUASH, z]} scale={[r, r * PUFF_SQUASH, r]} castShadow={!lifting} />
      ))}
      <group ref={asleep}>
        {[-0.55, 0.55].map((x) => (
          <mesh key={x} geometry={EYE_ARC} material={mats.face} position={[x, 0.36, face.eye - 0.02]} rotation={[0, 0, Math.PI]} />
        ))}
      </group>
      <group ref={awake}>
        {[-0.55, 0.55].map((x) => (
          <group key={x} position={[x, 0.3, face.eye - 0.04]}>
            <mesh geometry={SPHERE} material={mats.face} scale={[0.16, 0.2, 0.08]} />
            <mesh geometry={BEAD} material={mats.puff} position={[-0.05, 0.07, 0.06]} scale={0.05} />
          </group>
        ))}
      </group>
      <mesh geometry={MOUTH_ARC} material={mats.face} position={[0, 0.02, face.mouth - 0.02]} rotation={[0, 0, Math.PI]} />
      {[-0.95, 0.95].map((x) => (
        <mesh key={x} geometry={SPHERE} material={mats.cheek} position={[x, 0.04, face.cheek - 0.04]} scale={[0.22, 0.13, 0.06]} />
      ))}
      <mesh ref={zed} geometry={ZED} material={mats.zed} />
    </group>
  )
}

// ------------------------------------------------------------------ the badges

const BADGE: CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 10px',
  borderRadius: 999,
  background: 'rgba(255, 255, 255, 0.94)',
  border: `3px solid ${palette.ink}`,
  boxShadow: '0 4px 0 rgba(43, 33, 64, 0.28)',
  pointerEvents: 'none',
  userSelect: 'none',
  whiteSpace: 'nowrap',
}
const DOTS: CSSProperties = { display: 'flex', gap: 4 }
const TAIL: CSSProperties = {
  position: 'absolute',
  left: '50%',
  bottom: -9,
  width: 12,
  height: 12,
  marginLeft: -7.5,
  boxSizing: 'content-box',
  background: 'rgb(255, 255, 255)',
  borderRight: `3px solid ${palette.ink}`,
  borderBottom: `3px solid ${palette.ink}`,
  rotate: '45deg',
}
const DOT: CSSProperties = { width: 14, height: 14, borderRadius: '50%', boxSizing: 'border-box' }
const dotStyle = (k: 0 | 1 | 2, found: boolean): CSSProperties =>
  found ? { ...DOT, background: BABY_COLOURS[k], border: `2.5px solid ${palette.ink}` } : { ...DOT, background: 'rgba(43, 33, 64, 0.08)', border: '2.5px dashed rgba(43, 33, 64, 0.45)' }

/**
 * A little floating badge over every open island: the biggest animal measured there (once
 * it has one) and a dot for each of its three babies, filled in the baby's colour once
 * found. The badges pop in one after another as the map appears; an island just opened
 * gets its badge once its cloud has gone. They are pictures only: taps go through them.
 */
function Badges({ islands }: { islands: readonly IslandView[] }) {
  const size = useThree((s) => s.size)
  const scale = clamp(Math.min(size.width, size.height) / 760, 0.7, 1.15)
  return (
    <>
      {islands.map((s, i) => {
        if (!s.open) return null
        const p = ISLAND_AT[i]!
        return (
          <Html key={i} position={[p.x, BADGE_Y, p.z]} center zIndexRange={[0, 0]} pointerEvents="none">
            <Badge island={s} scale={scale} delay={s.lifting ? (LIFT_AFTER + LIFT_FOR * 0.7) * 1000 : 250 + i * 90} />
          </Html>
        )
      })}
    </>
  )
}

/** One badge, popping in once when it mounts, `delay` ms after. */
function Badge({ island, scale, delay }: { island: IslandView; scale: number; delay: number }) {
  const el = useRef<HTMLDivElement>(null!)
  useEffect(() => {
    el.current.animate(
      [
        { opacity: 0, transform: 'translateY(10px) scale(0.6)' },
        { opacity: 1, transform: 'translateY(-3px) scale(1.08)', offset: 0.7 },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 420, delay, easing: 'ease-out', fill: 'backwards' },
    )
  }, [delay])
  return (
    <div ref={el} style={{ ...BADGE, scale: `${scale}` }}>
      <span style={TAIL} />
      {island.best >= 0 && <AnimalIcon animal={island.best} size={34} />}
      <div style={DOTS}>
        {([0, 1, 2] as const).map((k) => (
          <span key={k} style={dotStyle(k, island.babies[k])} />
        ))}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ the fish

/** A number in [0, 1) from any number, the same every time. */
const hash = (n: number) => {
  const x = Math.sin(n * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

const FISH_TAIL = new ConeGeometry(0.16, 0.28, 16).rotateX(-Math.PI / 2)
const FIN = new ConeGeometry(0.07, 0.16, 12)

/** The big friendly fish's little cousin: now and then it jumps out of the sea between the islands with a splash at each end. */
function JumpingFish({ game }: { game: Game }) {
  const fish = useRef<Group>(null!)
  const rings = useRef<Mesh[]>([])
  const mats = useMemo(() => [0, 1].map(() => new MeshBasicMaterial({ color: '#f2fdff', transparent: true, depthWrite: false })), [])
  useEffect(() => () => mats.forEach((m) => m.dispose()), [mats])
  useFrame(() => {
    const t = game.clock
    const cycle = Math.floor(t / FISH_EVERY)
    const k = (t - cycle * FISH_EVERY) / FISH_JUMP
    // A spot in open water for this jump, the same for the whole jump.
    let sx = 0
    let sz = 0
    for (let n = 0; n < 12; n++) {
      sx = (hash(cycle * 7.13 + n * 1.7) * 2 - 1) * 22
      sz = (hash(cycle * 3.71 + n * 2.3 + 0.5) * 2 - 1) * 10
      let clear = true
      for (const p of ISLAND_AT) if (Math.hypot(p.x - sx, p.z - sz) < ISLAND_R + 2) clear = false
      if (clear) break
    }
    const dir = hash(cycle * 1.37 + 0.2) * Math.PI * 2
    const dx = Math.sin(dir)
    const dz = Math.cos(dir)
    const f = fish.current
    f.visible = k >= 0 && k <= 1
    if (f.visible) {
      const along = (k - 0.5) * 2.2
      f.position.set(sx + dx * along, -0.25 + 1.5 * 4 * k * (1 - k), sz + dz * along)
      const climb = Math.atan2(1.5 * 4 * (1 - 2 * k), 2.2)
      f.rotation.set(-climb, dir, 0, 'YXZ')
    }
    for (let end = 0; end < 2; end++) {
      const ring = rings.current[end]!
      const since = end === 0 ? k : k - 1
      const on = since >= 0 && since < 0.6
      ring.visible = on
      if (on) {
        const p = since / 0.6
        ring.position.set(sx + dx * (end === 0 ? -1.1 : 1.1), 0.04, sz + dz * (end === 0 ? -1.1 : 1.1))
        ring.scale.setScalar(0.25 + 0.6 * p)
        mats[end]!.opacity = 0.85 * (1 - p)
      }
    }
  })
  return (
    <>
      <group ref={fish}>
        <mesh geometry={SPHERE} material={fishSkin} scale={[0.2, 0.24, 0.34]} castShadow />
        <mesh geometry={FISH_TAIL} material={fishSkin} position={[0, 0, -0.38]} scale={[1, 1.3, 1]} />
        <mesh geometry={FIN} material={fishSkin} position={[0, 0.24, 0]} />
        {[-1, 1].map((side) => (
          <group key={side} position={[side * 0.13, 0.08, 0.2]}>
            <mesh geometry={BEAD} material={fishEye} scale={0.075} />
            <mesh geometry={BEAD} material={fishPupil} position={[side * 0.02, 0, 0.04]} scale={0.04} />
          </group>
        ))}
      </group>
      {[0, 1].map((end) => (
        <mesh
          key={end}
          ref={(m) => {
            if (m !== null) rings.current[end] = m
          }}
          geometry={PUFF_RING}
          material={mats[end]}
          renderOrder={4}
        />
      ))}
    </>
  )
}
const fishSkin = new MeshStandardMaterial({ color: palette.fish, roughness: 0.4 })
const fishEye = new MeshStandardMaterial({ color: palette.eye, roughness: 0.3 })
const fishPupil = new MeshStandardMaterial({ color: palette.pupil, roughness: 0.3 })

// ------------------------------------------------------------------ the map

/**
 * An island's tap target: its whole disc and a little round it, low, so a small finger
 * cannot miss it, yet it never reaches over the island behind it on the screen (the
 * landmarks catch the taps on themselves). Its material is never drawn, but the mesh stays
 * visible: the stage's tap filter skips whatever is hidden.
 */
const HIT = new CylinderGeometry(ISLAND_R + 0.25, ISLAND_R + 0.25, 1, 32)
const UNSEEN = new MeshBasicMaterial({ visible: false })

/** The five islands in the sea with their bridges, the slime hopping between them, its own camera and lights. */
export function MapScene({ game }: { game: Game }) {
  const look = useLook(game)
  const islands = useIslands(game)
  const [shownAt] = useState(() => game.clock)
  const clock = useMemo(() => () => game.clock, [game])
  const view = useMemo<View>(() => ({ yaw: 0, pitch: PITCH_WIDE, quaternion: new Quaternion() }), [])
  const scene = useThree((s) => s.scene)
  const canvas = useThree((s) => s.gl.domElement)
  const fog = useMemo(() => new Fog(SEA_DEEP, 60, 160), [])
  // The sea's deep blue behind everything and fading the far water into it, for as long as the map shows.
  useLayoutEffect(() => {
    const before = { background: scene.background, fog: scene.fog }
    scene.background = new Color(SEA_DEEP)
    scene.fog = fog
    return () => {
      scene.background = before.background
      scene.fog = before.fog
    }
  }, [scene, fog])
  useEffect(() => () => void (canvas.style.cursor = ''), [canvas])
  const pointing = (on: boolean) => () => void (canvas.style.cursor = on ? 'pointer' : '')
  return (
    <>
      <MapCamera game={game} view={view} fog={fog} />
      <MapLights />
      <Sea clock={clock} />
      <Bridges />
      {ISLAND_AT.map((p, i) => (
        <group
          key={i}
          position={[p.x, 0, p.z]}
          onPointerDown={(e: ThreeEvent<PointerEvent>) => {
            e.stopPropagation()
            game.chooseIsland(i)
          }}
          onPointerOver={pointing(true)}
          onPointerOut={pointing(false)}
        >
          <IslandArt index={i} clock={clock} facing={view.quaternion} />
          <mesh geometry={HIT} material={UNSEEN} position={[0, 0.5, 0]} />
        </group>
      ))}
      {islands.map((s, i) => (!s.open || s.lifting) && <Cloud key={i} game={game} index={i} lifting={s.lifting} shownAt={shownAt} view={view} />)}
      <ChosenRing game={game} />
      <MapSlime game={game} look={look} view={view} clock={clock} />
      {islands.flatMap((s, i) => ([0, 1, 2] as const).filter((k) => s.babies[k]).map((k) => <MapBaby key={`${i}:${k}`} game={game} island={i} baby={k} view={view} clock={clock} shownAt={shownAt} />))}
      <Badges islands={islands} />
      <JumpingFish game={game} />
    </>
  )
}
