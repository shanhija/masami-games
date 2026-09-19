import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { Color, Group, InstancedMesh, Mesh, Object3D } from 'three'

import { clamp01 } from '../game/math'
import { mulberry32 } from '../game/random'
import { FLIGHT_FOR, HINT_FOR, YARD_X, YARD_Z, cellAt, cellIndex, groundAt, pieceById, pieceCentre, pieceTop, sourceOf, type Flight, type NodeKind, type Sim } from '../game/sim'
import { Glow, GoodMesh, Shiny, Tinted, keepHeight, palette, pileAt, refAt, show } from './look'
import { Synced } from './Synced'

const scratch = new Object3D()

/** Everything that flies, bursts or points: the goods in the air, one pool of particles, the hint arrows, the walk target. */
export function Effects({ sim }: { sim: Sim }) {
  return (
    <>
      <Synced list={() => sim.flights} render={(f) => <FlightModel key={f.id} sim={sim} flight={f} />} />
      <Particles sim={sim} />
      <HintArrows sim={sim} />
      <WalkTarget sim={sim} />
    </>
  )
}

// -------------------------------------------------------------------------- flights

/** The arc's top stands this far over the higher of its two ends. */
const LOB = 4
const TRAIL = 5

/** Where a flight is at `u` in 0..1: a straight line over the ground, a lob in the air. */
function lob(f: Flight, end: { x: number; y: number; z: number }, u: number) {
  const h = Math.max(f.y0, end.y) + LOB - (f.y0 + end.y) / 2
  return { x: f.x0 + (end.x - f.x0) * u, y: f.y0 + (end.y - f.y0) * u + 4 * h * u * (1 - u), z: f.z0 + (end.z - f.z0) * u }
}

/** Colour cloth flies in the colour of the banner it came off or goes back to; from the dyer it is the pot's colour. */
function clothColour(sim: Sim, f: Flight) {
  const ends: [number, number][] = [
    [f.x0, f.z0],
    [f.x1, f.z1],
  ]
  for (const [x, z] of ends) {
    const c = cellAt(x, z)
    if (!c) continue
    const id = sim.cells[cellIndex(c.col, c.row)]!
    if (id <= 0) continue
    const p = pieceById(sim, id)
    if (p.kind === 'banner') return p.colour
  }
  return sim.dye
}

/** One good in the air, spinning along its lob, with a shadow disc on whatever is under it; a golden one drags five sparkles. */
function FlightModel({ sim, flight }: { sim: Sim; flight: Flight }) {
  const body = useRef<Group>(null!)
  const shadow = useRef<Mesh>(null!)
  const trail = useRef<Mesh[]>([])
  const end = useMemo(() => (flight.x1 === YARD_X && flight.z1 === YARD_Z ? { ...pileAt(flight.good), y: 0.6 } : { x: flight.x1, y: flight.y1, z: flight.z1 }), [flight])
  const colour = useMemo(() => clothColour(sim, flight), [sim, flight])
  useFrame(() => {
    const u = clamp01((sim.time - flight.at) / FLIGHT_FOR)
    const at = lob(flight, end, u)
    body.current.position.set(at.x, at.y, at.z)
    body.current.rotation.set(u * 7, flight.id + u * 5, 0)
    const ground = groundAt(sim, at.x, at.z)
    shadow.current.position.set(at.x, ground + 0.03, at.z)
    shadow.current.scale.setScalar(Math.max(0.3, 1 - (at.y - ground) / 12))
    trail.current.forEach((m, k) => {
      const back = u - (k + 1) * 0.06
      const p = lob(flight, end, Math.max(0, back))
      m.position.set(p.x, p.y, p.z)
      m.scale.setScalar(back < 0 ? 1e-4 : (1 - k / TRAIL) * (0.7 + 0.3 * Math.sin(sim.time * 25 + k)))
    })
  })
  return (
    <group>
      <group ref={body} scale={0.9}>
        <GoodMesh good={flight.good} colour={colour} />
      </group>
      <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0, 0.3, 12]} />
        <Glow color={palette.dirtDark} opacity={0.35} />
      </mesh>
      {flight.golden &&
        Array.from({ length: TRAIL }, (_, k) => (
          <mesh key={k} ref={refAt(trail, k)} scale={1e-4}>
            <sphereGeometry args={[0.16, 6, 5]} />
            <Glow color={palette.sparkle} />
          </mesh>
        ))}
    </group>
  )
}

// ------------------------------------------------------------------------ particles

const POOL = 500
const G = 9.8
const STEP_EVERY = 0.15

type Kind = 'dust' | 'puff' | 'confetti' | 'spark' | 'steam' | 'leaf' | 'grit' | 'fluff' | 'petal' | 'splash' | 'drop'

/** How a kind of particle is thrown: from a disc of `spread`, out at a `speed`, up with a `lift`; `thin` flattens a cube into a flake. */
interface Look {
  colours: readonly string[]
  size: number
  thin: number
  spread: number
  speed: readonly [number, number]
  lift: readonly [number, number]
  gravity: number
  life: number
  spin: number
}

const LOOK: Record<Kind, Look> = {
  dust: { colours: [palette.dust], size: 0.4, thin: 1, spread: 1.6, speed: [0.4, 1.8], lift: [0.8, 2.6], gravity: 1.5, life: 0.9, spin: 1.5 },
  puff: { colours: [palette.dust], size: 0.24, thin: 1, spread: 0.35, speed: [0.3, 1.2], lift: [0.5, 1.5], gravity: 1.2, life: 0.55, spin: 1.5 },
  confetti: { colours: palette.confetti, size: 0.2, thin: 0.3, spread: 0.5, speed: [1, 5], lift: [3, 8], gravity: 3, life: 2.6, spin: 9 },
  spark: { colours: [palette.gold, palette.sparkle], size: 0.16, thin: 1, spread: 0.3, speed: [2, 6], lift: [1, 7], gravity: 6, life: 0.9, spin: 7 },
  steam: { colours: [palette.steam], size: 0.45, thin: 1, spread: 1.4, speed: [0.1, 0.5], lift: [1.2, 2.6], gravity: -0.4, life: 1.4, spin: 0.6 },
  leaf: { colours: palette.leaves, size: 0.2, thin: 0.3, spread: 0.8, speed: [0.6, 2.5], lift: [0.5, 3], gravity: 4, life: 1, spin: 6 },
  grit: { colours: [palette.rock, palette.rockDark], size: 0.16, thin: 1, spread: 0.4, speed: [1, 3], lift: [2, 4.5], gravity: 9, life: 0.8, spin: 8 },
  fluff: { colours: [palette.woolWhite], size: 0.22, thin: 1, spread: 0.5, speed: [0.5, 2], lift: [1, 3], gravity: 2, life: 0.9, spin: 3 },
  petal: { colours: palette.dye, size: 0.15, thin: 0.3, spread: 0.5, speed: [0.5, 2], lift: [1.5, 3.5], gravity: 3, life: 1, spin: 6 },
  splash: { colours: [palette.water2, palette.waterLight], size: 0.14, thin: 1, spread: 0.6, speed: [0.8, 3], lift: [2, 4.5], gravity: 9, life: 0.6, spin: 0 },
  drop: { colours: [palette.water2], size: 0.14, thin: 1, spread: 0, speed: [0, 0], lift: [0, 0], gravity: G, life: 0.5, spin: 0 },
}

/** What flakes off a node under the hero's tool, and how high up it comes from. */
const CHIP: Record<NodeKind, { kind: Kind; y: number }> = {
  tree: { kind: 'leaf', y: 3 },
  rock: { kind: 'grit', y: 0.8 },
  ore: { kind: 'grit', y: 0.8 },
  sheep: { kind: 'fluff', y: 0.7 },
  flowers: { kind: 'petal', y: 0.5 },
  lostbanner: { kind: 'petal', y: 0.5 },
}

interface Particle {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  born: number
  life: number
  colour: Color
  size: number
  thin: number
  gravity: number
  spin: number
}

const tints = new Map<string, Color>()
function tint(hex: string) {
  let c = tints.get(hex)
  if (!c) {
    c = new Color(hex)
    tints.set(hex, c)
  }
  return c
}

/** A fixed ring of particle slots: a spawn takes the next slot, oldest first, so a big party never grows the pool. */
class Pool {
  readonly slots: Particle[] = Array.from({ length: POOL }, () => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, born: -1, life: 0, colour: tint(palette.dust), size: 0, thin: 1, gravity: 0, spin: 0 }))
  /** Sim time of the frame being drawn. */
  time = 0
  /** Set by a spawn: the instance colours must go to the GPU this frame. */
  tinted = false
  private next = 0
  private rand = mulberry32(4242)

  burst(kind: Kind, x: number, y: number, z: number, count: number) {
    const look = LOOK[kind]
    for (let i = 0; i < count; i++) {
      const a = this.rand() * Math.PI * 2
      const r = Math.sqrt(this.rand()) * look.spread
      const b = this.rand() * Math.PI * 2
      const speed = look.speed[0] + this.rand() * (look.speed[1] - look.speed[0])
      const lift = look.lift[0] + this.rand() * (look.lift[1] - look.lift[0])
      this.fill(x + Math.cos(a) * r, y, z + Math.sin(a) * r, Math.cos(b) * speed, lift, Math.sin(b) * speed, look, look.life * (0.8 + this.rand() * 0.4))
    }
  }

  /** One drop of the water arc, thrown from the hand so that it comes down on the fire as its life runs out. */
  drop(x: number, y: number, z: number, tx: number, ty: number, tz: number) {
    const look = LOOK.drop
    const T = look.life
    const ex = tx + (this.rand() - 0.5) * 0.8
    const ez = tz + (this.rand() - 0.5) * 0.8
    this.fill(x, y, z, (ex - x) / T, (ty - y + 0.5 * look.gravity * T * T) / T, (ez - z) / T, look, T)
  }

  private fill(x: number, y: number, z: number, vx: number, vy: number, vz: number, look: Look, life: number) {
    const p = this.slots[this.next]!
    this.next = (this.next + 1) % POOL
    p.x = x
    p.y = y
    p.z = z
    p.vx = vx
    p.vy = vy
    p.vz = vz
    p.born = this.time
    p.life = life
    p.colour = tint(look.colours[Math.floor(this.rand() * look.colours.length)]!)
    p.size = look.size * (0.7 + this.rand() * 0.6)
    p.thin = look.thin
    p.gravity = look.gravity
    p.spin = look.spin * (this.rand() - 0.5) * 2
    this.tinted = true
  }
}

/** Remembers the newest value per id and says whether a known id's value has moved on; a new id is only remembered. */
function moved(seen: Map<number, number>, id: number, at: number) {
  const last = seen.get(id)
  seen.set(id, at)
  return last !== undefined && last !== at
}

/**
 * Every burst in the game out of one instanced mesh of small boxes: dust when a piece
 * goes up or is mended, confetti for a wish and a new piece, sparks off the bolt and the
 * bell, steam off a doused fire, chips off whatever the hero is working on, the water
 * arc from the hero's hand, splashes in the puddles, footsteps and hops. Everything is
 * found by comparing the sim's timestamps with the last ones seen, never from events.
 */
function Particles({ sim }: { sim: Sim }) {
  const mesh = useRef<InstancedMesh>(null!)
  const pool = useMemo(() => new Pool(), [])
  /** The last value seen of every timestamp a burst hangs on, primed from the sim so a restored castle does not start with a party. */
  const seen = useMemo(
    () => ({
      time: sim.time,
      built: new Map(sim.pieces.map((p) => [p.id, p.builtAt])),
      doused: new Map(sim.pieces.map((p) => [p.id, p.dousedAt])),
      hit: new Map(sim.nodes.map((n) => [n.id, n.hitAt])),
      hop: new Map(sim.nodes.map((n) => [n.id, n.hopAt])),
      splash: new Map(sim.puddles.map((p) => [p.id, p.splashedAt])),
      wish: sim.wishDoneAt,
      bolt: sim.lightning.at,
      bong: sim.bongAt,
      heroHop: sim.hero.hopAt,
      step: 0,
    }),
    [sim],
  )

  useLayoutEffect(() => {
    scratch.position.set(0, 0, 0)
    scratch.rotation.set(0, 0, 0)
    scratch.scale.setScalar(1e-4)
    scratch.updateMatrix()
    for (let i = 0; i < POOL; i++) {
      mesh.current.setMatrixAt(i, scratch.matrix)
      mesh.current.setColorAt(i, pool.slots[i]!.colour)
    }
    mesh.current.instanceMatrix.needsUpdate = true
    mesh.current.instanceColor!.needsUpdate = true
  }, [pool])

  useFrame(() => {
    const t = sim.time
    const dt = Math.min(0.1, Math.max(0, t - seen.time))
    seen.time = t
    pool.time = t
    const h = sim.hero

    for (const p of sim.pieces) {
      const fresh = !seen.built.has(p.id)
      if (moved(seen.built, p.id, p.builtAt) || fresh) {
        const c = pieceCentre(p)
        pool.burst('dust', c.x, 0.4, c.z, 18)
        if (fresh) pool.burst('confetti', c.x, pieceTop(p), c.z, 30)
      }
      if (moved(seen.doused, p.id, p.dousedAt)) {
        const c = pieceCentre(p)
        pool.burst('steam', c.x, pieceTop(p), c.z, 10)
      }
    }
    for (const n of sim.nodes) {
      if (moved(seen.hit, n.id, n.hitAt)) pool.burst(CHIP[n.kind].kind, n.x, CHIP[n.kind].y, n.z, 6)
      if (n.kind === 'sheep' && moved(seen.hop, n.id, n.hopAt)) pool.burst('puff', n.x, 0.1, n.z, 6)
    }
    for (const p of sim.puddles) if (moved(seen.splash, p.id, p.splashedAt)) pool.burst('splash', p.x, 0.1, p.z, 12)
    if (sim.wishDoneAt !== seen.wish) {
      seen.wish = sim.wishDoneAt
      pool.burst('confetti', 0, keepHeight(sim) + 2, 0, 80)
    }
    if (sim.lightning.at !== seen.bolt) {
      seen.bolt = sim.lightning.at
      pool.burst('spark', sim.lightning.x, sim.lightning.y, sim.lightning.z, 30)
    }
    if (sim.bongAt !== seen.bong) {
      seen.bong = sim.bongAt
      const bell = sim.pieces.find((p) => p.kind === 'belltower' && p.state === 'ok')
      if (bell) {
        const c = pieceCentre(bell)
        pool.burst('spark', c.x, pieceTop(bell) + 0.8, c.z, 20)
      } else {
        pool.burst('spark', 0, keepHeight(sim) + 0.8, 0, 20)
      }
    }
    if (h.hopAt !== seen.heroHop) {
      seen.heroHop = h.hopAt
      pool.burst('puff', h.x, h.y + 0.1, h.z, 6)
    }
    if (h.moving && h.y === 0) {
      if (t >= seen.step) {
        seen.step = t + STEP_EVERY
        pool.burst('puff', h.x, 0.1, h.z, 2)
      }
    } else {
      seen.step = t
    }
    if (h.job && h.job.kind === 'douse') {
      const p = pieceById(sim, h.job.id)
      const c = pieceCentre(p)
      for (let i = 0; i < 2; i++) pool.drop(h.x, h.y + 0.8, h.z, c.x, pieceTop(p) * 0.6, c.z)
    }

    const m = mesh.current
    for (let i = 0; i < POOL; i++) {
      const p = pool.slots[i]!
      const age = t - p.born
      if (p.born < 0 || age < 0 || age >= p.life || p.y < -0.1) {
        scratch.scale.setScalar(1e-4)
      } else {
        p.vy -= p.gravity * dt
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.z += p.vz * dt
        // A quick pop in, a steady middle, a fade over the last part of the life.
        const k = Math.min(1, age / (0.12 * p.life), (p.life - age) / (0.4 * p.life))
        scratch.position.set(p.x, p.y, p.z)
        scratch.rotation.set(age * p.spin, age * p.spin * 0.7 + i, 0)
        scratch.scale.set(p.size * k, p.size * k * p.thin, p.size * k)
      }
      scratch.updateMatrix()
      m.setMatrixAt(i, scratch.matrix)
      if (pool.tinted) m.setColorAt(i, p.colour)
    }
    m.instanceMatrix.needsUpdate = true
    if (pool.tinted) {
      m.instanceColor!.needsUpdate = true
      pool.tinted = false
    }
  })

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, POOL]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <Tinted />
    </instancedMesh>
  )
}

// ----------------------------------------------------------------- arrows and target

const ARROWS = 6

/** Big gold arrows bouncing over wherever the missing good comes from, for a few seconds after a build button says no. */
function HintArrows({ sim }: { sim: Sim }) {
  const arrows = useRef<Group[]>([])
  useFrame(() => {
    const hint = sim.hint
    const age = hint ? sim.time - hint.at : Infinity
    let points: { x: number; z: number }[] = []
    if (hint && age < HINT_FOR) {
      points = sourceOf(sim, hint.good)
      if (points.length === 0) points = [{ x: YARD_X, z: YARD_Z }]
    }
    const k = Math.max(1e-4, Math.min(1, age / 0.25, (HINT_FOR - age) / 0.4))
    arrows.current.forEach((g, i) => {
      if (i >= points.length) {
        show(g, false)
        return
      }
      const p = points[i]!
      show(g, true)
      g.position.set(p.x, groundAt(sim, p.x, p.z) + 4.5 + 1.5 * Math.abs(Math.sin(age * 5)), p.z)
      g.rotation.y = age * 2 + i
      g.scale.setScalar(k)
    })
  })
  return (
    <>
      {Array.from({ length: ARROWS }, (_, i) => (
        <group key={i} ref={refAt(arrows, i)} visible={false}>
          <mesh position={[0, 0.7, 0]} rotation={[Math.PI, 0, 0]} castShadow>
            <coneGeometry args={[0.7, 1.4, 8]} />
            <Shiny color={palette.arrow} />
          </mesh>
          <mesh position={[0, 1.9, 0]} castShadow>
            <boxGeometry args={[0.5, 1, 0.5]} />
            <Shiny color={palette.arrow} />
          </mesh>
        </group>
      ))}
    </>
  )
}

/** A white ring pulsing on the ground where a tap sent the hero, until the hero gets there. */
function WalkTarget({ sim }: { sim: Sim }) {
  const ring = useRef<Mesh>(null!)
  useFrame(() => {
    const target = sim.hero.target
    if (target === null) {
      show(ring.current, false)
      return
    }
    show(ring.current, true)
    ring.current.position.set(target.x, groundAt(sim, target.x, target.z) + 0.04, target.z)
    ring.current.scale.setScalar(1 + 0.18 * Math.sin(sim.time * 6))
  })
  return (
    <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
      <ringGeometry args={[0.5, 0.78, 28]} />
      <Glow color={palette.cellRing} opacity={0.5} />
    </mesh>
  )
}
