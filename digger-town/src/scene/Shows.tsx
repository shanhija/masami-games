/**
 * The chapters' parties, each a few seconds of show as a function of the party's clock. The sim
 * already gathers the animals, walks Bunny to her door, sends the cows and sheep over the bridge,
 * puts the animals on the slide and in the pond; the actors here are what it does not do: the ice
 * cream van and its big cones, the suitcase, the ribbon on the bridge, the children on the swing and
 * the fireworks over the clock.
 */

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CircleGeometry, Matrix4, MeshBasicMaterial, Quaternion, Vector3, type Group, type InstancedMesh } from 'three'

import type { Game } from '../game/game'
import { clamp01, lerp, localX, localZ, TAU } from '../game/math'
import { BUILDS } from '../game/map'
import { newMachine } from '../game/model'
import type { Sim } from '../game/model'
import { groundY } from '../game/world'
import { walkInSize, WAVE_SIZE } from './Animals'
import { Driver } from './Driver'
import { fireworkBurst, rocketTrail, stars, puff } from './Effects'
import type { Pool } from './Effects'
import { box, cylinder, part, roundBox, SOLID, Static, sphere, Wheels, type Part } from './parts'
import { ARRIVE, easeOut, LAUNCH_AFTER, LEAVE, RISE_FOR, rocket, VAN_FROM, VAN_Z, vanX } from './parties'
import { put, solidGeo, SWING_SEAT_X, SWING_TOP } from './Things'

const PINK = '#ff8ec4'
const CREAM = '#fff4dc'
const CONE = '#e0a85a'

/** The party running now, and its clock in seconds, or null. */
const partyOf = (sim: Sim, chapter: string) => (sim.party !== null && sim.party.chapter === chapter ? sim.party.t : null)

// ---------------------------------------------------------------------------------------
// The road: an ice cream van drives in along the road and hands out big cones.

/** Where the serving window is, in the van's own frame. */
const WINDOW: readonly [number, number, number] = [1.15, 2.1, -0.6]
const CONES = 8
const CONE_FIRST = 4.6
const CONE_EVERY = 0.55
const CONE_FLIGHT = 0.9

const bigCone = (at: readonly [number, number, number], s: number, colours: readonly [string, string]): Part[] => [
  part(cylinder(0.6 * s, 0, 1.3 * s, 14), 'plush', [at[0], at[1], at[2]], { colour: CONE }),
  part(sphere(0.7 * s, 14), 'plush', [at[0], at[1] + 0.85 * s, at[2]], { colour: colours[0] }),
  part(sphere(0.52 * s, 14), 'plush', [at[0], at[1] + 1.5 * s, at[2]], { colour: colours[1] }),
  part(sphere(0.14 * s, 8), 'trim', [at[0], at[1] + 2.0 * s, at[2]], { colour: '#e0302a' }),
]

const VAN: Part[] = [
  part(roundBox(2.2, 1.3, 4.6, 0.25), 'trim', [0, 1.0, 0], { colour: CREAM }),
  part(roundBox(2.2, 1.7, 3.2, 0.32), 'trim', [0, 2.0, -0.6], { colour: CREAM }),
  part(box(2.26, 0.3, 3.3), 'trim', [0, 1.45, -0.6], { colour: PINK }),
  part(roundBox(2.1, 0.9, 0.1, 0.05), 'dark', [0, 1.85, 2.3]),
  part(roundBox(0.06, 0.9, 1.5, 0.04), 'dark', [1.12, WINDOW[1], WINDOW[2]]),
  part(box(1.0, 0.07, 1.9), 'trim', [1.55, 2.78, WINDOW[2]], { colour: PINK, rot: [0, 0, -0.3] }),
  part(box(1.0, 0.075, 0.4), 'trim', [1.56, 2.78, WINDOW[2] + 0.5], { colour: '#ffffff', rot: [0, 0, -0.3] }),
  part(box(1.0, 0.075, 0.4), 'trim', [1.56, 2.78, WINDOW[2] - 0.5], { colour: '#ffffff', rot: [0, 0, -0.3] }),
  part(box(2.3, 0.2, 0.2), 'chrome', [0, 0.55, 2.35]),
  part(box(2.3, 0.2, 0.2), 'chrome', [0, 0.55, -2.35]),
  ...[1, -1].flatMap((s) => [part(sphere(0.19, 10), 'lamp', [s * 0.75, 1.0, 2.33]), part(box(0.3, 0.2, 0.06), 'lamp', [s * 0.8, 1.2, -2.32], { colour: '#e0302a' })]),
  part(cylinder(0.4, 0.4, 0.1, 14), 'plush', [0, 2.9, -0.6], { colour: '#ffffff' }),
  ...bigCone([0, 3.95, -0.6], 1.1, [PINK, '#fff6ea']),
]

const WHEEL_SPOTS = [1, -1].flatMap((s) => [
  { x: s * 1.0, y: 0.5, z: 1.55, steer: 0 },
  { x: s * 1.0, y: 0.5, z: -1.5, steer: 0 },
])
/** The flying cones' flavours, bottom scoop and top scoop: strawberry and vanilla, mint and chocolate, lemon and strawberry, chocolate and vanilla. Cone i has flavour i mod 4, one instanced mesh each. */
const FLAVOURS: readonly (readonly [string, string])[] = [
  ['#ff8ec4', '#fff6ea'],
  ['#86e0b4', '#7a4a2c'],
  ['#ffe066', '#ff8ec4'],
  ['#8b5a3c', '#fff6ea'],
]
const PER_FLAVOUR = Math.ceil(CONES / FLAVOURS.length)

function IceCreamShow({ game, pool }: { game: Game; pool: Pool }) {
  const sim = game.sim
  const van = useRef<Group>(null)
  const cones = useRef<(InstancedMesh | null)[]>([])
  const counts = useRef(FLAVOURS.map(() => 0))
  const fired = useRef<boolean[]>([])
  const fake = useMemo(() => newMachine('dumper', { x: 0, z: 0, yaw: 0 }), [])
  const geos = useMemo(() => FLAVOURS.map((f, k) => solidGeo(`showCone${k}`, bigCone([0, 0, 0], 1, f))), [])
  useFrame(() => {
    const t = partyOf(sim, 'road')
    van.current!.visible = t !== null
    const n = counts.current
    n.fill(0)
    if (t === null) {
      fired.current = []
      for (const mesh of cones.current) {
        mesh!.count = 0
        mesh!.visible = false
      }
      return
    }
    const x = vanX(t)
    van.current!.position.set(x, groundY(sim, x, VAN_Z), VAN_Z)
    // The van bounces a little as it rolls, and rocks when it stops.
    const moving = t < ARRIVE || t > LEAVE
    van.current!.position.y += moving ? Math.abs(Math.sin(t * 14)) * 0.04 : 0
    fake.rollL = fake.rollR = x - VAN_FROM
    const window = [localX(x, Math.PI / 2, WINDOW[0], WINDOW[2]), WINDOW[1], localZ(VAN_Z, Math.PI / 2, WINDOW[0], WINDOW[2])] as const
    const animals = sim.animals.filter((a) => a.z > -33)
    for (let i = 0; i < CONES; i++) {
      const u = (t - CONE_FIRST - i * CONE_EVERY) / CONE_FLIGHT
      if (u < 0 || u >= 1 + 0.2) continue
      const target = animals[(i * 3) % animals.length]
      if (target === undefined) continue
      const gx = target.x
      const gy = target.y + 1.1
      const gz = target.z
      const f = clamp01(u)
      const k = i % FLAVOURS.length
      put(cones.current[k]!, n[k]++, lerp(window[0], gx, f), lerp(window[1], gy, f) + 2.4 * 4 * f * (1 - f), lerp(window[2], gz, f), f * TAU * 2, u > 1 ? Math.max(0, 1 - (u - 1) * 5) : 1.1, 1.1, 1.1, 0, f * TAU)
      if (u >= 1 && !fired.current[i]) {
        fired.current[i] = true
        stars(pool, 4, gx, gy, gz, { speed: 2, up: 4, size: 0.5, colour: FLAVOURS[k][0] })
        puff(pool, 3, gx, gy, gz, FLAVOURS[k][1], { speed: 1.2, up: 1.5, size: 0.3 })
      }
    }
    cones.current.forEach((mesh, k) => {
      mesh!.count = n[k]
      mesh!.visible = n[k] > 0
      mesh!.instanceMatrix.needsUpdate = true
    })
  })
  return (
    <>
      <group ref={van} visible={false} rotation={[0, Math.PI / 2, 0]}>
        <Static parts={VAN} paint="#ffffff" />
        <Wheels m={fake} paint="#ff8ec4" radius={0.5} width={0.34} spots={WHEEL_SPOTS} />
      </group>
      {geos.map((geo, k) => (
        <instancedMesh
          key={k}
          ref={(mesh) => {
            cones.current[k] = mesh
          }}
          args={[geo, SOLID, PER_FLAVOUR]}
          frustumCulled={false}
          visible={false}
        />
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------------------
// The house: Bunny carries her suitcase to the door; it goes in with her.

const SUITCASE: Part[] = [
  part(roundBox(0.5, 0.36, 0.16, 0.05), 'trim', [0, 0, 0], { colour: '#b5532f' }),
  part(box(0.5, 0.04, 0.17), 'trim', [0, 0, 0], { colour: '#f2c14e' }),
  part(box(0.04, 0.36, 0.17), 'trim', [0.15, 0, 0], { colour: '#f2c14e' }),
  part(box(0.04, 0.36, 0.17), 'trim', [-0.15, 0, 0], { colour: '#f2c14e' }),
  part(box(0.2, 0.06, 0.06), 'chrome', [0, 0.21, 0]),
]

function SuitcaseShow({ game, pool }: { game: Game; pool: Pool }) {
  const sim = game.sim
  const ref = useRef<Group>(null)
  const walking = useRef(false)
  useFrame(() => {
    const t = partyOf(sim, 'house')
    const bunny = t === null ? undefined : sim.animals.find((a) => a.species === 'bunny' && a.home === 0)
    const g = ref.current!
    const now = bunny !== undefined && bunny.mood === 'walk'
    g.visible = now
    if (walking.current && !now && bunny !== undefined) stars(pool, 7, bunny.x, bunny.y + 1.2, bunny.z, { speed: 2.4, up: 5, size: 0.55 })
    walking.current = now
    if (!now || bunny === undefined) return
    // In her hand, swinging with her steps, as big as she is.
    const ph = bunny.t * 9 + bunny.id
    const size = walkInSize(bunny)
    g.scale.setScalar(size)
    g.position.set(localX(bunny.x, bunny.yaw, 0.34 * size, 0.12 * size), bunny.y + (0.3 + Math.abs(Math.sin(ph)) * 0.06) * size, localZ(bunny.z, bunny.yaw, 0.34 * size, 0.12 * size))
    g.rotation.set(0, bunny.yaw + Math.PI / 2, Math.sin(ph) * 0.22)
  })
  return (
    <group ref={ref} visible={false}>
      <Static parts={SUITCASE} paint="#ffffff" />
    </group>
  )
}

/** A round pink glow behind each animal waving from her window, so she shows against the cream wall: its radius in metres, how far behind her it hangs, and how many there can be. */
const HALO = 1.5
const HALO_BEHIND = 0.2
const HALOS = 4
const haloGeometry = new CircleGeometry(1, 40)
const haloMaterial = new MeshBasicMaterial({ color: '#ff9ccf', toneMapped: false })
const haloQuat = new Quaternion()
const haloMatrix = new Matrix4()
const haloPos = new Vector3()
const haloScale = new Vector3()

function WaveHalo({ game }: { game: Game }) {
  const sim = game.sim
  const halos = useRef<InstancedMesh>(null)
  useFrame(() => {
    const mesh = halos.current!
    let n = 0
    for (const a of sim.animals) {
      if (a.mood !== 'wave' || a.home < 0 || n >= HALOS) continue
      const pulse = 1 + 0.04 * Math.sin(a.t * 5)
      haloMatrix.compose(haloPos.set(a.x, a.y + 0.55 * WAVE_SIZE, a.z - HALO_BEHIND), haloQuat, haloScale.setScalar(HALO * pulse))
      mesh.setMatrixAt(n++, haloMatrix)
    }
    mesh.count = n
    mesh.visible = n > 0
    mesh.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh ref={halos} args={[haloGeometry, haloMaterial, HALOS]} frustumCulled={false} visible={false} />
  )
}

// ---------------------------------------------------------------------------------------
// The bridge: a ribbon at the town end that the first cow cuts.

const RIBBON_Z = -30.2
const RIBBON_X = 3.4
const POSTS: Part[] = [1, -1].flatMap((s) => [
  part(cylinder(0.12, 0.14, 1.6, 10), 'trim', [8 + s * RIBBON_X, 0.8, RIBBON_Z], { colour: '#ffffff' }),
  part(sphere(0.2, 10), 'trim', [8 + s * RIBBON_X, 1.65, RIBBON_Z], { colour: '#e5483f' }),
])
/** One half of the ribbon, hanging from its post along +x (the other is flipped). */
const HALF_RIBBON: Part[] = [
  part(box(RIBBON_X, 0.22, 0.04), 'trim', [RIBBON_X / 2, 0, 0], { colour: '#e5483f' }),
  part(box(RIBBON_X, 0.05, 0.05), 'trim', [RIBBON_X / 2, 0.06, 0], { colour: '#ffffff' }),
  part(sphere(0.2, 8), 'trim', [RIBBON_X - 0.1, -0.05, 0], { colour: '#e5483f' }),
]
const CUT_FOR = 0.7

function RibbonShow({ game, pool }: { game: Game; pool: Pool }) {
  const sim = game.sim
  const root = useRef<Group>(null)
  const halves = useRef<(Group | null)[]>([])
  const cutAt = useRef<number | null>(null)
  useFrame(() => {
    const t = partyOf(sim, 'bridge')
    root.current!.visible = t !== null
    if (t === null) {
      cutAt.current = null
      return
    }
    if (cutAt.current === null && sim.animals.some((a) => (a.species === 'cow' || a.species === 'sheep') && Math.abs(a.x - 8) < 3 && a.z > RIBBON_Z - 0.5 && a.z < -20)) {
      cutAt.current = t
      stars(pool, 8, 8, 1.4, RIBBON_Z, { speed: 3, up: 5, colour: '#ff5e5e' })
      puff(pool, 6, 8, 1.2, RIBBON_Z, '#ffffff', { speed: 2.2, up: 2, size: 0.3 })
    }
    const u = cutAt.current === null ? 0 : clamp01((t - cutAt.current) / CUT_FOR)
    // Each half swings away from the middle and droops.
    halves.current.forEach((g, k) => {
      g!.rotation.y = (k === 0 ? 1 : -1) * easeOut(u) * 1.35
      g!.rotation.z = (k === 0 ? 1 : -1) * easeOut(u) * -0.5
    })
  })
  return (
    <group ref={root} visible={false}>
      <Static parts={POSTS} paint="#ffffff" />
      {[1, -1].map((s, k) => (
        <group key={s} ref={(g) => void (halves.current[k] = g)} position={[8 + s * RIBBON_X, 1.35, RIBBON_Z]} rotation={[0, s === 1 ? Math.PI : 0, 0]}>
          <Static parts={HALF_RIBBON} paint="#ffffff" />
        </group>
      ))}
    </group>
  )
}

// ---------------------------------------------------------------------------------------
// The playground: two children swing on the seats.

const KIDS = [
  { species: 'pig', hat: '#5ec8ff' },
  { species: 'sheep', hat: '#ff7f50' },
] as const

function SwingShow({ game }: { game: Game }) {
  const sim = game.sim
  const pivots = useRef<(Group | null)[]>([])
  const spot = BUILDS[2].spots[1]
  useFrame(() => {
    const t = partyOf(sim, 'play')
    const there = t !== null && sim.builds[2].placed >= 2
    pivots.current.forEach((g, k) => {
      g!.visible = there
      if (!there) return
      // The same swing the seats make in Builds.
      g!.rotation.x = Math.sin(sim.time * 2.2 + k * 1.1) * 0.5
      g!.scale.setScalar(easeOut(clamp01((t - 0.4 - k * 0.5) / 0.6)) + 0.001)
    })
  })
  return (
    <>
      {KIDS.map((kid, k) => (
        <group key={kid.species} ref={(g) => void (pivots.current[k] = g)} position={[spot.x + SWING_SEAT_X[k], spot.y + SWING_TOP, spot.z]} visible={false}>
          <group position={[0, -1.93, 0]}>
            <Driver species={kid.species} hat={kid.hat} />
          </group>
        </group>
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------------------
// The clock: fireworks over the hall at night.

interface Rocket {
  t: number
  x: number
  y: number
  z: number
  colour: string
}

function Fireworks({ game, pool }: { game: Game; pool: Pool }) {
  const sim = game.sim
  const rockets = useMemo<Rocket[]>(() => [], [])
  const launched = useRef(0)
  useFrame((_, delta) => {
    const dt = game.paused ? 0 : Math.min(delta, 0.1)
    for (const e of game.events) {
      if (e.kind !== 'fireworks') continue
      for (const after of LAUNCH_AFTER) rockets.push({ t: -after, ...rocket(launched.current++, Math.random) })
    }
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i]
      const before = r.t
      r.t += dt
      if (r.t < 0) continue
      const rising = before < RISE_FOR
      if (rising) rocketTrail(pool, r.x, lerp(groundY(sim, r.x, r.z), r.y, clamp01(r.t / RISE_FOR)), r.z)
      if (rising && r.t >= RISE_FOR) {
        fireworkBurst(pool, r.x, r.y, r.z, r.colour)
        rockets.splice(i, 1)
      }
    }
  })
  return null
}

export function Shows({ game, pool }: { game: Game; pool: Pool }) {
  return (
    <>
      <IceCreamShow game={game} pool={pool} />
      <SuitcaseShow game={game} pool={pool} />
      <WaveHalo game={game} />
      <RibbonShow game={game} pool={pool} />
      <SwingShow game={game} />
      <Fireworks game={game} pool={pool} />
    </>
  )
}
