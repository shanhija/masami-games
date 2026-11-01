import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { Color, DoubleSide, Group, InstancedMesh, Mesh, MeshBasicMaterial, Object3D, RingGeometry, SphereGeometry, type Camera } from 'three'

import { clamp01, lerp, mulberry32, smoothstep } from '../game/math'
import { FAN_R, PAD_H, type CircleNumber, type Sim } from '../game/model'
import { onGround } from './ground'
import { palette, type Theme } from './look'
import { CARD_LIT_DX, CARD_LIT_DZ, CARD_LIT_SCALE, FLAG_TOP, KEY_Y, MARK_DROP, WATER_Y, cardCentre, flagPoles } from './place'
import { cached, easeOutBack, heartGeometry, starGeometry } from './shapes'

const scratch = new Object3D()

/**
 * Everything that bursts, splashes, flies or blows for a moment, all found by comparing
 * the sim's timestamps with the last ones seen (never from its events): sparkles where a
 * ball is taken, hearts where a baby is found, a splash with droplets and the big
 * friendly fish that spits the slime back, puffs where it lands and a shock ring at a big
 * slime's bounce, foam bits at a paddle's hit and dizzy stars over its head, sugar off a
 * marshmallow, confetti from a flag, sparkles off the key and the lit animal card, wind
 * streaks and leaves before a fan blowing hard, stars bursting up out of every popped
 * circle (a hundred is a little firework), and the pops of the tower.
 */
export function Effects({ sim, theme }: { sim: Sim; theme: Theme }) {
  const spray = useMemo(() => new Spray(), [])
  const kinds = useMemo(() => looks(theme), [theme])
  return (
    <>
      <Particles sim={sim} theme={theme} spray={spray} kinds={kinds} />
      <Fish sim={sim} spray={spray} kinds={kinds} />
      <Wind sim={sim} />
      <Dizzy sim={sim} />
    </>
  )
}

// ------------------------------------------------------------------ the spray

type Shape = 'puff' | 'drop' | 'star' | 'heart' | 'bit'
const SHAPES: readonly Shape[] = ['puff', 'drop', 'star', 'heart', 'bit']
/** How many of each can be in the air at once; a new one takes the oldest slot. */
const POOL: Record<Shape, number> = { puff: 180, drop: 160, star: 300, heart: 48, bit: 220 }
/** Flat ones always turn to face the camera. */
const FACING: Record<Shape, boolean> = { puff: false, drop: false, star: true, heart: true, bit: false }

/** How a kind of particle is thrown: from a disc `spread` wide, out at a `speed` and up with a `lift` (or every way when `round`), pulled down by `gravity`, slowed by `drag`; `thin` flattens a bit into a flake. */
interface Look {
  shape: Shape
  colours: readonly string[]
  size: number
  spread: number
  speed: readonly [number, number]
  lift: readonly [number, number]
  gravity: number
  drag: number
  life: number
  spin: number
  thin: number
  round: boolean
}

/** Every kind of burst, in the island's colours where it matters (the splash in its water, the hit bits in its foam colours). */
function looks(theme: Theme) {
  const stars = [palette.star, palette.white, palette.gold] as const
  return {
    plop: { shape: 'star', colours: [palette.star, palette.white, '#bff7ff'], size: 0.13, spread: 0.12, speed: [0.8, 2.2], lift: [1.2, 3], gravity: 5, drag: 1, life: 0.55, spin: 6, thin: 1, round: false },
    hearts: { shape: 'heart', colours: ['#ff5e8a', '#ff8fc8', '#ff3b6b'], size: 0.2, spread: 0.25, speed: [0.3, 1.2], lift: [1.4, 2.8], gravity: -0.6, drag: 0.6, life: 1.5, spin: 1.5, thin: 1, round: false },
    splash: { shape: 'drop', colours: [theme.water, theme.foam, palette.white], size: 0.13, spread: 0.5, speed: [1.2, 3.8], lift: [3.5, 7], gravity: 14, drag: 0.3, life: 1, spin: 0, thin: 1, round: false },
    foam: { shape: 'puff', colours: [theme.foam, palette.white], size: 0.32, spread: 0.6, speed: [0.4, 1.4], lift: [0.6, 1.8], gravity: 3, drag: 1.5, life: 0.7, spin: 1, thin: 1, round: false },
    land: { shape: 'puff', colours: [palette.white, '#f2f4ff'], size: 0.14, spread: 0.1, speed: [1.2, 2.6], lift: [0.15, 0.6], gravity: 0.5, drag: 4, life: 0.45, spin: 2, thin: 1, round: false },
    hit: { shape: 'bit', colours: theme.accent, size: 0.15, spread: 0.3, speed: [2, 4.5], lift: [2, 5], gravity: 9, drag: 0.5, life: 0.9, spin: 10, thin: 0.55, round: false },
    bump: { shape: 'puff', colours: [palette.white], size: 0.18, spread: 0.2, speed: [0.6, 1.6], lift: [0.4, 1.2], gravity: 1, drag: 3, life: 0.4, spin: 2, thin: 1, round: false },
    sugar: { shape: 'puff', colours: [palette.white, '#ffd6ef', '#fff0fa'], size: 0.2, spread: 0.6, speed: [1, 2.6], lift: [0.6, 2.2], gravity: 2.5, drag: 1.5, life: 0.7, spin: 2, thin: 1, round: false },
    confetti: { shape: 'bit', colours: palette.confetti, size: 0.13, spread: 0.25, speed: [1.2, 3.5], lift: [3, 6], gravity: 5, drag: 0.8, life: 2.2, spin: 9, thin: 0.25, round: false },
    sparkle: { shape: 'star', colours: stars, size: 0.15, spread: 0.35, speed: [0.6, 2.2], lift: [0.5, 2.4], gravity: 1, drag: 1, life: 0.9, spin: 5, thin: 1, round: false },
    pop1: { shape: 'star', colours: [palette.star, palette.white], size: 0.2, spread: 0.25, speed: [1.2, 3], lift: [2.5, 5.5], gravity: 2.5, drag: 0.6, life: 1.2, spin: 5, thin: 1, round: false },
    pop5: { shape: 'star', colours: [palette.star, palette.gold, '#ff8fc8', palette.white], size: 0.22, spread: 0.3, speed: [1.6, 4], lift: [3, 6.5], gravity: 2.5, drag: 0.6, life: 1.4, spin: 5, thin: 1, round: false },
    pop100: { shape: 'star', colours: palette.confetti, size: 0.22, spread: 0.2, speed: [4, 7], lift: [1, 2], gravity: 2.5, drag: 1, life: 1.7, spin: 6, thin: 1, round: true },
    bonk: { shape: 'star', colours: [palette.star, palette.white], size: 0.2, spread: 0.1, speed: [2.5, 4.5], lift: [-2, 2], gravity: 0, drag: 2.5, life: 0.65, spin: 8, thin: 1, round: true },
    launch: { shape: 'puff', colours: [palette.white, '#f2f4ff'], size: 0.3, spread: 0.6, speed: [1.5, 3], lift: [0.2, 1], gravity: 0.5, drag: 3, life: 0.6, spin: 2, thin: 1, round: false },
    spit: { shape: 'puff', colours: [palette.white, theme.foam], size: 0.24, spread: 0.15, speed: [0.2, 0.8], lift: [0.6, 1.6], gravity: 1, drag: 2, life: 0.6, spin: 2, thin: 1, round: false },
    bubbles: { shape: 'drop', colours: [theme.foam, palette.white], size: 0.1, spread: 0.9, speed: [0.2, 0.8], lift: [1.5, 3.5], gravity: 7, drag: 0.5, life: 0.7, spin: 0, thin: 1, round: false },
  } satisfies Record<string, Look>
}
type Looks = ReturnType<typeof looks>

interface Particle {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  born: number
  life: number
  size: number
  thin: number
  gravity: number
  drag: number
  spin: number
  colour: Color
}

/** A ring on the water or in the air, growing and fading: a splash, a plop, a big slime's shock wave. */
interface Ring {
  born: number
  life: number
  x: number
  y: number
  z: number
  r0: number
  r1: number
  opacity: number
  /** Flat on the ground or water; otherwise it faces the camera. */
  flat: boolean
  colour: Color
}
const RINGS = 12

/** One shared colour per hex, so a burst never makes new ones. */
const tint = cached((hex: string) => new Color(hex))

/**
 * Fixed rings of particle slots per shape and of ring slots: a burst takes the next
 * slots, oldest first, so a party never grows anything. Positions are three's (the
 * burst methods take sim coordinates and flip z).
 */
class Spray {
  readonly slots: Record<Shape, Particle[]>
  readonly next: Record<Shape, number> = { puff: 0, drop: 0, star: 0, heart: 0, bit: 0 }
  /** A burst changed some colours, which must go to the GPU. */
  readonly tinted: Record<Shape, boolean> = { puff: false, drop: false, star: false, heart: false, bit: false }
  readonly rings: Ring[] = Array.from({ length: RINGS }, () => ({ born: -1, life: 1, x: 0, y: 0, z: 0, r0: 0, r1: 1, opacity: 1, flat: true, colour: tint(palette.white) }))
  /** Bursts that go off a moment later (the second and third bang of a firework). */
  readonly later: { at: number; look: Look; x: number; y: number; z: number; count: number }[] = []
  /** Sim time of the frame being drawn. */
  time = 0
  private ring = 0
  private rand = mulberry32(4242)

  constructor() {
    const blank = (): Particle => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, born: -1, life: 1, size: 0, thin: 1, gravity: 0, drag: 0, spin: 0, colour: tint(palette.white) })
    this.slots = { puff: [], drop: [], star: [], heart: [], bit: [] }
    for (const s of SHAPES) this.slots[s] = Array.from({ length: POOL[s] }, blank)
  }

  /** `count` particles of a look from sim (x, y, z), every size, spread and speed times `scale`. */
  burst(l: Look, x: number, y: number, z: number, count: number, scale: number) {
    const r = this.rand
    for (let i = 0; i < count; i++) {
      const s = l.shape
      const p = this.slots[s][this.next[s]]!
      this.next[s] = (this.next[s] + 1) % POOL[s]
      const a = r() * Math.PI * 2
      const d = Math.sqrt(r()) * l.spread * scale
      const speed = (l.speed[0] + r() * (l.speed[1] - l.speed[0])) * scale
      const lift = (l.lift[0] + r() * (l.lift[1] - l.lift[0])) * Math.sqrt(scale)
      p.x = x + Math.cos(a) * d
      p.y = y
      p.z = -(z + Math.sin(a) * d)
      if (l.round) {
        // Every way at once, a little upward.
        const u = r() * 2 - 1
        const b = r() * Math.PI * 2
        const h = Math.sqrt(1 - u * u)
        p.vx = h * Math.cos(b) * speed
        p.vy = u * speed + lift
        p.vz = h * Math.sin(b) * speed
      } else {
        const b = r() * Math.PI * 2
        p.vx = Math.cos(b) * speed
        p.vy = lift
        p.vz = Math.sin(b) * speed
      }
      p.born = this.time
      p.life = l.life * (0.8 + r() * 0.4)
      p.size = l.size * scale * (0.7 + r() * 0.6)
      p.thin = l.thin
      p.gravity = l.gravity
      p.drag = l.drag
      p.spin = l.spin * (r() - 0.5) * 2
      p.colour = tint(l.colours[Math.floor(r() * l.colours.length)]!)
      this.tinted[s] = true
    }
  }

  /** The same burst, `delay` sim seconds from now. */
  burstLater(delay: number, l: Look, x: number, y: number, z: number, count: number) {
    this.later.push({ at: this.time + delay, look: l, x, y, z, count })
  }

  /** A ring at sim (x, y, z) growing from r0 to r1 over `life`. */
  addRing(x: number, y: number, z: number, r0: number, r1: number, life: number, opacity: number, flat: boolean, colour: string) {
    const g = this.rings[this.ring]!
    this.ring = (this.ring + 1) % RINGS
    g.born = this.time
    g.life = life
    g.x = x
    g.y = y
    g.z = -z
    g.r0 = r0
    g.r1 = r1
    g.opacity = opacity
    g.flat = flat
    g.colour = tint(colour)
  }
}

/** Whether a timestamp has just been set: it is a time (not -1) and not the one seen last. */
const fresh = (seen: number, now: number) => now >= 0 && now !== seen

/** How many stars and how they fly for a circle of each number. */
function popOf(l: Looks, n: CircleNumber) {
  return n === 1 ? { look: l.pop1, count: 8 } : n === 5 ? { look: l.pop5, count: 18 } : { look: l.pop100, count: 36 }
}

/** The particles and rings: watches every timestamp, throws the bursts, moves them and draws them. */
function Particles({ sim, theme, spray, kinds }: { sim: Sim; theme: Theme; spray: Spray; kinds: Looks }) {
  const meshes = useRef<Record<Shape, InstancedMesh | null>>({ puff: null, drop: null, star: null, heart: null, bit: null })
  const rings = useRef<(Mesh | null)[]>([])
  const ringMaterials = useMemo(() => Array.from({ length: RINGS }, () => new MeshBasicMaterial({ transparent: true, depthWrite: false, side: DoubleSide })), [])
  useLayoutEffect(() => () => ringMaterials.forEach((m) => m.dispose()), [ringMaterials])
  const geos = useMemo(
    () => ({
      puff: new SphereGeometry(1, 10, 7),
      drop: new SphereGeometry(1, 8, 6),
      star: starGeometry(5, 1, 0.45),
      heart: heartGeometry(),
      bit: new SphereGeometry(1, 8, 6),
      ring: new RingGeometry(0.8, 1, 48),
    }),
    [],
  )
  useLayoutEffect(() => () => Object.values(geos).forEach((g) => g.dispose()), [geos])
  // The last value seen of every timestamp, primed from the sim so a new scene starts quiet.
  const seen = useMemo(
    () => ({
      time: sim.time,
      balls: new Map(sim.balls.map((b) => [b.id, b.takenAt])),
      babies: sim.babies.map((b) => b.takenAt),
      landed: sim.slime.landedAt,
      bounce: sim.slime.bounceAt,
      hit: sim.slime.hitAt,
      bump: sim.slime.bumpAt,
      splash: sim.slime.splashAt,
      pads: sim.pads.map((p) => p.boingAt),
      flags: sim.flags.map((f) => f.reachedAt),
      key: sim.finish.keyAt,
      measure: sim.finish.measureAt,
      top: sim.finish.topAt,
      pops: sim.tower.circles.map((c) => c.poppedAt),
      launch: sim.tower.launchAt,
      bonk: sim.tower.bonkAt,
      funnel: sim.tower.funnelAt,
    }),
    [sim],
  )

  useLayoutEffect(() => {
    scratch.position.set(0, -100, 0)
    scratch.rotation.set(0, 0, 0)
    scratch.scale.setScalar(1e-4)
    scratch.updateMatrix()
    for (const s of SHAPES) {
      const m = meshes.current[s]!
      for (let i = 0; i < POOL[s]; i++) {
        m.setMatrixAt(i, scratch.matrix)
        m.setColorAt(i, spray.slots[s][i]!.colour)
      }
      m.instanceMatrix.needsUpdate = true
      m.instanceColor!.needsUpdate = true
    }
  }, [spray])

  useFrame((state) => {
    const t = sim.time
    const dt = Math.min(0.1, Math.max(0, t - seen.time))
    seen.time = t
    spray.time = t
    const s = sim.slime
    const k = kinds

    for (const b of sim.balls) {
      const was = seen.balls.get(b.id)
      seen.balls.set(b.id, b.takenAt)
      if (was === undefined || !fresh(was, b.takenAt)) continue
      spray.burst(k.plop, b.x, b.y, b.z, 7, 1)
      spray.addRing(b.x, b.y, b.z, 0.15, 0.75, 0.35, 0.8, false, palette.white)
    }
    for (let i = 0; i < sim.babies.length; i++) {
      const b = sim.babies[i]!
      if (fresh(seen.babies[i]!, b.takenAt) && !b.home) spray.burst(k.hearts, b.x, b.y + 0.4, b.z, 9, 1)
      seen.babies[i] = b.takenAt
    }
    if (fresh(seen.landed, s.landedAt) && s.y > -0.3) {
      spray.burst(k.land, s.x, s.y + 0.05, s.z, Math.round(6 + 5 * s.size), 0.6 + 0.4 * s.size)
    }
    seen.landed = s.landedAt
    if (fresh(seen.bounce, s.bounceAt)) {
      spray.addRing(s.x, s.y + 0.04, s.z, 0.6 * s.r, 2.5 + s.r, 0.55, 0.85, true, palette.white)
      spray.burst(k.land, s.x, s.y + 0.05, s.z, 16, 1.3 + 0.3 * s.size)
    }
    seen.bounce = s.bounceAt
    if (fresh(seen.hit, s.hitAt)) spray.burst(k.hit, s.x, s.y + s.r * 1.4, s.z, 14, 0.8 + 0.25 * s.size)
    seen.hit = s.hitAt
    if (fresh(seen.bump, s.bumpAt)) spray.burst(k.bump, s.x, s.y + s.r, s.z + s.r, 7, 0.7 + 0.3 * s.size)
    seen.bump = s.bumpAt
    if (fresh(seen.splash, s.splashAt)) {
      const scale = 0.7 + 0.35 * s.size
      spray.burst(k.splash, s.splashX, WATER_Y + 0.05, s.splashZ, Math.round(22 + 8 * s.size), scale)
      spray.burst(k.foam, s.splashX, WATER_Y + 0.05, s.splashZ, 10, scale)
      spray.addRing(s.splashX, WATER_Y + 0.03, s.splashZ, 0.4, 2.2 + s.r, 0.8, 0.9, true, theme.foam)
      spray.addRing(s.splashX, WATER_Y + 0.03, s.splashZ, 0.3, 1.4 + s.r, 0.6, 0.7, true, theme.foam)
    }
    seen.splash = s.splashAt
    for (let i = 0; i < sim.pads.length; i++) {
      const p = sim.pads[i]!
      if (fresh(seen.pads[i]!, p.boingAt)) {
        spray.burst(k.sugar, p.spec.x, PAD_H, p.spec.z, 14, 1)
        spray.addRing(p.spec.x, PAD_H + 0.02, p.spec.z, 0.5, 2, 0.45, 0.7, true, '#ffd6ef')
      }
      seen.pads[i] = p.boingAt
    }
    for (let i = 0; i < sim.flags.length; i++) {
      const f = sim.flags[i]!
      if (fresh(seen.flags[i]!, f.reachedAt)) for (const x of flagPoles(sim.course, f.spec.z)) spray.burst(k.confetti, x, FLAG_TOP + 0.1, f.spec.z, 22, 1)
      seen.flags[i] = f.reachedAt
    }
    const fin = sim.finish
    if (fresh(seen.key, fin.keyAt)) {
      spray.burst(k.sparkle, 0, KEY_Y, sim.course.finishZ, 20, 1.2)
      spray.addRing(0, KEY_Y, sim.course.finishZ, 0.2, 1.4, 0.4, 0.9, false, palette.gold)
    }
    seen.key = fin.keyAt
    if (fresh(seen.measure, fin.measureAt)) {
      const c = cardCentre(sim.course, fin.animal)
      spray.burstLater(MARK_DROP + 0.15, k.sparkle, c.x + CARD_LIT_DX, c.y, c.z + CARD_LIT_DZ, 16 + Math.round(4 * CARD_LIT_SCALE))
    }
    seen.measure = fin.measureAt
    const tw = sim.tower
    for (let i = 0; i < tw.circles.length; i++) {
      const c = tw.circles[i]!
      if (fresh(seen.pops[i]!, c.poppedAt)) {
        const pop = popOf(k, c.n)
        spray.burst(pop.look, c.x, c.y, tw.z, pop.count, 1)
        spray.addRing(c.x, c.y, tw.z, c.r * 0.6, c.r * 1.8, 0.4, 0.8, false, palette.star)
        if (c.n === 100) {
          spray.burstLater(0.22, k.pop100, c.x - 1.2, c.y + 1.4, tw.z, 26)
          spray.burstLater(0.45, k.pop100, c.x + 1.3, c.y + 2.2, tw.z, 22)
          spray.burstLater(0.1, k.confetti, c.x, c.y, tw.z, 24)
        }
      }
      seen.pops[i] = c.poppedAt
    }
    if (fresh(seen.launch, tw.launchAt)) {
      spray.burst(k.launch, 0, 0.3, tw.z, 14, 1)
      spray.addRing(0, 0.25, tw.z, 0.8, 3.2, 0.5, 0.75, true, palette.white)
    }
    seen.launch = tw.launchAt
    if (fresh(seen.bonk, tw.bonkAt)) spray.burst(k.bonk, s.x, s.y + s.r, s.z, 14, 1)
    seen.bonk = tw.bonkAt
    if (fresh(seen.funnel, tw.funnelAt)) spray.burst(k.sparkle, 0, tw.giantY, tw.z, 26, 2)
    seen.funnel = tw.funnelAt
    if (fresh(seen.top, fin.topAt)) {
      spray.burst(k.confetti, 0, tw.topY + 0.4, tw.z, 36, 1.2)
      spray.burst(k.launch, 0, tw.topY + 0.2, tw.z, 10, 1)
    }
    seen.top = fin.topAt
    for (let i = spray.later.length - 1; i >= 0; i--) {
      const b = spray.later[i]!
      if (t < b.at) continue
      spray.burst(b.look, b.x, b.y, b.z, b.count, 1)
      spray.later.splice(i, 1)
    }

    drawParticles(spray, meshes.current, state.camera, t, dt)
    drawRings(spray, rings.current, ringMaterials, state.camera, t)
  })

  return (
    <>
      {SHAPES.map((shape) => (
        <instancedMesh
          key={shape}
          ref={(m) => {
            meshes.current[shape] = m
          }}
          args={[geos[shape], undefined, POOL[shape]]}
          frustumCulled={false}
          visible={false}
        >
          {shape === 'star' || shape === 'heart' ? (
            <meshBasicMaterial side={DoubleSide} toneMapped={false} />
          ) : (
            // Puffs glow a little so they stay soft and white rather than grey on their shady side.
            <meshStandardMaterial roughness={shape === 'drop' ? 0.15 : shape === 'bit' ? 0.5 : 1} emissive={palette.white} emissiveIntensity={shape === 'puff' ? 0.35 : 0} />
          )}
        </instancedMesh>
      ))}
      {Array.from({ length: RINGS }, (_, i) => (
        <mesh
          key={i}
          ref={(m) => {
            rings.current[i] = m
          }}
          geometry={geos.ring}
          material={ringMaterials[i]}
          visible={false}
          renderOrder={3}
        />
      ))}
    </>
  )
}

/**
 * Moves every live particle by sim dt and sets the copies' matrices: a quick pop in, a
 * steady middle, a shrink over the last part of the life. A shape with nothing in the air
 * is not drawn at all.
 */
function drawParticles(spray: Spray, meshes: Record<Shape, InstancedMesh | null>, camera: Camera, t: number, dt: number) {
  for (const shape of SHAPES) {
    const m = meshes[shape]
    if (!m) throw new Error(`the ${shape} particles are missing`)
    const slots = spray.slots[shape]
    let alive = 0
    let touched = false
    for (let i = 0; i < slots.length; i++) {
      const p = slots[i]!
      const age = t - p.born
      if (p.born < 0 || age < 0 || age >= p.life || p.y < WATER_Y - 0.05) {
        if (p.born >= 0) {
          p.born = -1
          scratch.scale.setScalar(1e-4)
          scratch.updateMatrix()
          m.setMatrixAt(i, scratch.matrix)
          touched = true
        }
        continue
      }
      alive++
      touched = true
      const fade = Math.exp(-p.drag * dt)
      p.vx *= fade
      p.vz *= fade
      p.vy = p.vy * fade - p.gravity * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.z += p.vz * dt
      const k = Math.min(1, age / (0.12 * p.life), (p.life - age) / (0.4 * p.life))
      scratch.position.set(p.x, p.y, p.z)
      if (FACING[shape]) {
        scratch.quaternion.copy(camera.quaternion)
        scratch.rotateZ(age * p.spin + i)
      } else {
        scratch.rotation.set(age * p.spin, age * p.spin * 0.7 + i, 0)
      }
      scratch.scale.set(p.size * k, p.size * k * p.thin, p.size * k)
      scratch.updateMatrix()
      m.setMatrixAt(i, scratch.matrix)
      if (spray.tinted[shape]) m.setColorAt(i, p.colour)
    }
    m.visible = alive > 0
    if (touched) m.instanceMatrix.needsUpdate = true
    if (spray.tinted[shape]) {
      m.instanceColor!.needsUpdate = true
      spray.tinted[shape] = false
    }
  }
}

/** Grows and fades every ring, flat on the water or turned to the camera. */
function drawRings(spray: Spray, meshes: readonly (Mesh | null)[], materials: readonly MeshBasicMaterial[], camera: Camera, t: number) {
  for (let i = 0; i < spray.rings.length; i++) {
    const g = spray.rings[i]!
    const m = meshes[i]
    if (!m) throw new Error('a ring is missing')
    const age = t - g.born
    m.visible = g.born >= 0 && age >= 0 && age < g.life
    if (!m.visible) continue
    const k = age / g.life
    const r = lerp(g.r0, g.r1, 1 - (1 - k) * (1 - k))
    m.position.set(g.x, g.y, g.z)
    if (g.flat) m.rotation.set(-Math.PI / 2, 0, 0)
    else m.quaternion.copy(camera.quaternion)
    m.scale.setScalar(r)
    const mat = materials[i]!
    mat.opacity = g.opacity * (1 - k) * (1 - k)
    mat.color.copy(g.colour)
  }
}

// ------------------------------------------------------------------ the fish

/** The fish comes up this long after the splash, and goes back down over this long once it has spat. */
const FISH_RISE_FROM = 0.15
const FISH_RISE_FOR = 0.4
const FISH_STAY = 0.55
const FISH_SINK_FOR = 0.55

/**
 * The big friendly fish: round and orange with big eyes and a smile. It comes up out of
 * the water where the slime fell in, clear of the track's edge (or small enough to fit
 * a hole), facing the way it will spit; when the slime flies off it opens its mouth wide
 * and lurches, then smiles, waves its fins and sinks back with a few bubbles.
 */
function Fish({ sim, spray, kinds }: { sim: Sim; spray: Spray; kinds: Looks }) {
  const root = useRef<Group>(null!)
  const body = useRef<Group>(null!)
  const tail = useRef<Group>(null!)
  const fins = useRef<(Mesh | null)[]>([])
  const mouth = useRef<Mesh>(null!)
  const smile = useRef<Mesh>(null!)
  /** The splash it is up for, where it stands, how big it is, which way it faces, and when the slime left (-1 before). */
  const state = useRef({ splashAt: -1, x: 0, z: 0, size: 1, yaw: 0, spitAt: -1, sankAt: -1 })
  useFrame(() => {
    const t = sim.time
    const s = sim.slime
    const f = state.current
    if (s.splashAt !== f.splashAt) {
      f.splashAt = s.splashAt
      f.spitAt = -1
      f.sankAt = -1
      if (s.splashAt >= 0) {
        // Spat back toward the last flag passed (or the start), on the middle of the track.
        const toZ = sim.checkpoint >= 0 ? sim.flags[sim.checkpoint]!.spec.z : 0
        let dx = -s.splashX
        let dz = toZ - s.splashZ
        const len = Math.hypot(dx, dz) || 1
        dx /= len
        dz /= len
        f.yaw = Math.atan2(dx, -dz)
        const hole = sim.course.holes.find((h) => Math.hypot(s.splashX - h.x, s.splashZ - h.z) < h.r + 0.3)
        if (hole) {
          f.size = Math.min(1.2 + 0.45 * s.size, hole.r * 0.85)
          f.x = hole.x
          f.z = hole.z
        } else {
          placeFish(sim, s.splashX, s.splashZ, dx, dz, s.r, 1.2 + 0.45 * s.size, f)
        }
      }
    }
    const g = root.current
    g.visible = f.splashAt >= 0 && t >= f.splashAt + FISH_RISE_FROM && (f.sankAt < 0 || t < f.sankAt + FISH_SINK_FOR)
    if (!g.visible) return
    const age = t - f.splashAt
    const F = f.size
    // The slime has gone once it is up out of the water or away from where it fell; if that is never seen, the fish spits on time anyway. A puff comes out of its mouth.
    if (f.spitAt < 0 && ((age > FISH_RISE_FROM + FISH_RISE_FOR * 0.6 && (sim.phase !== 'splash' || s.y > WATER_Y + 0.4 || Math.hypot(s.x - s.splashX, s.z - s.splashZ) > 0.6)) || age > 1.8)) {
      f.spitAt = t
      spray.burst(kinds.spit, f.x + Math.sin(f.yaw) * F, WATER_Y + 0.25 * F, f.z - Math.cos(f.yaw) * F, 10, F * 0.6)
    }
    if (f.spitAt >= 0 && f.sankAt < 0 && t >= f.spitAt + FISH_STAY) {
      f.sankAt = t
      spray.burst(kinds.bubbles, f.x, WATER_Y + 0.1, f.z, 12, f.size * 0.7)
    }
    const up = easeOutBack(clamp01((age - FISH_RISE_FROM) / FISH_RISE_FOR))
    const down = f.sankAt >= 0 ? smoothstep(0, 1, (t - f.sankAt) / FISH_SINK_FOR) : 0
    const spit = f.spitAt >= 0 ? t - f.spitAt : -1
    const lurch = spit >= 0 ? Math.sin(Math.min(1, spit / 0.35) * Math.PI) : 0
    g.position.set(f.x, WATER_Y + lerp(-2.4 * F, 0.42 * F, up * (1 - down)), -f.z)
    g.rotation.set(0, f.yaw, 0)
    g.scale.setScalar(F)
    body.current.rotation.set(-0.35 * lurch + 0.06 * Math.sin(t * 2.4), 0, 0.05 * Math.sin(t * 1.7))
    body.current.position.z = 0.25 * lurch
    tail.current.rotation.y = 0.45 * Math.sin(t * 9)
    fins.current.forEach((m, i) => {
      if (!m) throw new Error('a fish fin is missing')
      m.rotation.z = (i === 0 ? 1 : -1) * (0.7 + 0.35 * Math.sin(t * 7 + i))
    })
    // The mouth opens wide as it spits and closes again into the smile.
    const open = spit < 0 ? 0.12 * up : spit < 0.08 ? spit / 0.08 : Math.max(0, 1 - (spit - 0.08) / 0.4)
    mouth.current.visible = open > 0.15
    mouth.current.scale.set(0.32 * (0.5 + 0.5 * open), 0.26 * open, 0.12)
    smile.current.visible = open <= 0.15
  })
  const eye = (x: number) => (
    <group key={x}>
      <mesh position={[x * 0.4, 0.38, 0.72]}>
        <sphereGeometry args={[0.3, 16, 12]} />
        <meshStandardMaterial color={palette.eye} roughness={0.2} />
      </mesh>
      <mesh position={[x * 0.43, 0.38, 0.98]}>
        <sphereGeometry args={[0.16, 14, 10]} />
        <meshStandardMaterial color={palette.pupil} roughness={0.2} />
      </mesh>
      <mesh position={[x * 0.37, 0.47, 1.1]}>
        <sphereGeometry args={[0.055, 10, 8]} />
        <meshBasicMaterial color={palette.white} />
      </mesh>
      <mesh position={[x * 0.64, 0.02, 0.78]} scale={[0.16, 0.1, 0.05]}>
        <sphereGeometry args={[1, 12, 8]} />
        <meshStandardMaterial color={palette.blush} roughness={0.6} />
      </mesh>
    </group>
  )
  return (
    <group ref={root} visible={false}>
      <group ref={body}>
        <mesh scale={[0.95, 0.88, 1]} castShadow>
          <sphereGeometry args={[1, 28, 20]} />
          <meshStandardMaterial color={palette.fish} roughness={0.35} />
        </mesh>
        <mesh position={[0, -0.3, 0.22]} scale={[0.78, 0.6, 0.8]}>
          <sphereGeometry args={[1, 24, 16]} />
          <meshStandardMaterial color="#ffd9a8" roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.78, -0.3]} rotation={[-0.5, 0, 0]} scale={[0.05, 0.36, 0.62]}>
          <sphereGeometry args={[1, 14, 10]} />
          <meshStandardMaterial color="#ff7a2f" roughness={0.4} />
        </mesh>
        {[1, -1].map((x, i) => (
          <mesh
            key={x}
            ref={(m) => {
              fins.current[i] = m
            }}
            position={[x * 0.88, -0.38, 0.05]}
            scale={[0.05, 0.2, 0.34]}
          >
            <sphereGeometry args={[1, 12, 8]} />
            <meshStandardMaterial color="#ff7a2f" roughness={0.4} />
          </mesh>
        ))}
        <group ref={tail} position={[0, 0.05, -0.95]}>
          {[1, -1].map((y) => (
            <mesh key={y} position={[0, y * 0.28, -0.22]} rotation={[-y * 0.6, 0, 0]} scale={[0.1, 0.42, 0.32]}>
              <sphereGeometry args={[1, 12, 8]} />
              <meshStandardMaterial color="#ff7a2f" roughness={0.4} />
            </mesh>
          ))}
        </group>
        {[1, -1].map(eye)}
        <mesh ref={smile} position={[0, -0.2, 0.97]} rotation={[0, 0, Math.PI]}>
          <torusGeometry args={[0.26, 0.05, 8, 20, Math.PI]} />
          <meshStandardMaterial color={palette.ink} roughness={0.4} />
        </mesh>
        <mesh ref={mouth} position={[0, -0.22, 0.95]} visible={false}>
          <sphereGeometry args={[1, 16, 12]} />
          <meshStandardMaterial color="#7a2a3a" roughness={0.5} />
        </mesh>
      </group>
    </group>
  )
}

/**
 * Puts the fish just behind the slime as it will fly (dx, dz), so the slime sits at its
 * mouth, as near the splash at (x, z) as it fits in the water: it slides sideways a
 * little at a time to clear the track, and if the water there is too narrow (between the
 * track and a side path) it comes up smaller instead of far away.
 */
function placeFish(sim: Sim, x: number, z: number, dx: number, dz: number, r: number, size: number, out: { x: number; z: number; size: number }) {
  for (let s = size; s > 0.5; s *= 0.85) {
    const back = 0.9 * s + 0.6 * r
    for (let k = 0; k <= 8; k++) {
      for (const side of k === 0 ? [1] : [1, -1]) {
        const fx = x - dx * back + side * k * 0.2 * s
        const fz = z - dz * back
        if (touchesGround(sim, fx, fz, s * 0.82)) continue
        out.x = fx
        out.z = fz
        out.size = s
        return
      }
    }
  }
  out.x = x
  out.z = z
  out.size = 0.5
}

/** Whether a disc of radius r round sim (x, z) touches any slab. */
function touchesGround(sim: Sim, x: number, z: number, r: number) {
  if (onGround(sim.course, x, z)) return true
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    if (onGround(sim.course, x + Math.cos(a) * r, z + Math.sin(a) * r)) return true
  }
  return false
}

// ------------------------------------------------------------------ the wind

const STREAKS = 16
const LEAVES = 6
const LEAF_COLOURS = ['#5ec25a', '#ffd23f', '#ff9f43', '#8fd45e'] as const

/** A fixed number in 0..1 for every streak, from its index, so the wind looks the same every time. */
const hash = (i: number, k: number) => {
  const v = Math.sin(i * 127.1 + k * 311.7) * 43758.5453
  return v - Math.floor(v)
}

/** White wind lines and tumbling leaves flying from every fan toward the slime while it blows hard, fewer once it has got easy. */
function Wind({ sim }: { sim: Sim }) {
  const lines = useRef<InstancedMesh>(null!)
  const leaves = useRef<InstancedMesh>(null!)
  const fans = sim.fans.length
  useLayoutEffect(() => {
    if (fans === 0) return
    const c = new Color()
    for (let i = 0; i < fans * LEAVES; i++) leaves.current.setColorAt(i, c.set(LEAF_COLOURS[i % LEAF_COLOURS.length]!))
    leaves.current.instanceColor!.needsUpdate = true
  }, [fans])
  useFrame(() => {
    if (fans === 0) return
    const t = sim.time
    for (let f = 0; f < sim.fans.length; f++) {
      const fan = sim.fans[f]!
      const k = smoothstep(0.5, 0.78, fan.power) * (fan.easy ? 0.6 : 1)
      const { x, z, width, reach } = fan.spec
      const from = z - FAN_R * 0.6
      const span = Math.max(1, reach - FAN_R * 0.6)
      for (let i = 0; i < STREAKS; i++) {
        const u = (t * (10 / span) + hash(i, f)) % 1
        const y = 0.25 + hash(i, f + 7) * 2.3 + 0.12 * Math.sin(t * 5 + i)
        scratch.position.set(x + (hash(i, f + 3) - 0.5) * width * 0.92, y, -(from - u * span))
        scratch.rotation.set(Math.PI / 2, 0, 0)
        const len = (0.6 + hash(i, f + 11) * 0.9) * k * Math.sin(Math.PI * u)
        scratch.scale.set(Math.max(1e-4, 0.035 * Math.sqrt(k)), Math.max(1e-4, len), Math.max(1e-4, 0.035 * Math.sqrt(k)))
        scratch.updateMatrix()
        lines.current.setMatrixAt(f * STREAKS + i, scratch.matrix)
      }
      for (let i = 0; i < LEAVES; i++) {
        const u = (t * (7 / span) + hash(i + 40, f)) % 1
        const wob = Math.sin(t * 6 + i * 2)
        scratch.position.set(x + (hash(i + 40, f + 3) - 0.5) * width * 0.8 + 0.3 * wob, 0.4 + hash(i + 40, f + 9) * 1.8 + 0.3 * Math.sin(t * 4 + i), -(from - u * span))
        scratch.rotation.set(t * 7 + i, t * 5 + i * 2, wob)
        scratch.scale.set(0.16 * k, 0.03 * k, 0.11 * k)
        if (k <= 0) scratch.scale.setScalar(1e-4)
        scratch.updateMatrix()
        leaves.current.setMatrixAt(f * LEAVES + i, scratch.matrix)
      }
    }
    lines.current.instanceMatrix.needsUpdate = true
    leaves.current.instanceMatrix.needsUpdate = true
  })
  if (fans === 0) return null
  return (
    <>
      <instancedMesh ref={lines} args={[undefined, undefined, fans * STREAKS]} frustumCulled={false} renderOrder={2}>
        <capsuleGeometry args={[1, 1, 4, 8]} />
        <meshBasicMaterial color={palette.white} transparent opacity={0.7} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={leaves} args={[undefined, undefined, fans * LEAVES]} frustumCulled={false} castShadow>
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial side={DoubleSide} roughness={0.7} />
      </instancedMesh>
    </>
  )
}

// ------------------------------------------------------------------ dizzy stars

const DIZZY_FOR = 1.6
const DIZZY_STARS = 4

/** Little stars circling over the slime's head after a paddle hits it or it bonks a circle in the tower. */
function Dizzy({ sim }: { sim: Sim }) {
  const mesh = useRef<InstancedMesh>(null!)
  const star = useMemo(() => starGeometry(5, 1, 0.45), [])
  useLayoutEffect(() => () => star.dispose(), [star])
  useFrame((state) => {
    const t = sim.time
    const s = sim.slime
    const at = Math.max(s.hitAt, sim.tower.bonkAt)
    const age = at >= 0 ? t - at : Infinity
    const on = age < DIZZY_FOR
    mesh.current.visible = on
    if (!on) return
    const k = Math.min(1, age / 0.15, (DIZZY_FOR - age) / 0.3)
    const top = s.y + (s.hidden ? 0.4 : 2 * s.r) + 0.25
    for (let i = 0; i < DIZZY_STARS; i++) {
      const a = age * 7 + (i / DIZZY_STARS) * Math.PI * 2
      const rad = 0.3 + 0.45 * s.r
      scratch.position.set(s.x + Math.cos(a) * rad, top + 0.08 * Math.sin(a * 2), -(s.z + Math.sin(a) * rad))
      scratch.quaternion.copy(state.camera.quaternion)
      scratch.rotateZ(age * 5 + i)
      scratch.scale.setScalar((0.13 + 0.07 * s.r) * k)
      scratch.updateMatrix()
      mesh.current.setMatrixAt(i, scratch.matrix)
    }
    mesh.current.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh ref={mesh} args={[star, undefined, DIZZY_STARS]} frustumCulled={false} visible={false}>
      <meshBasicMaterial color={palette.star} side={DoubleSide} toneMapped={false} />
    </instancedMesh>
  )
}
