/**
 * The particles: one global pool of 400, drawn as four instanced shapes (blobs, stars, coins and
 * chips). It is fed by the sim's streams (stuff falling in its own colour, a tapered column when
 * thick), the frame's events (bites, dumps, landings, coins, stars, puffs, confetti) and the
 * machines' own motion (dust from tracks and tyres). Shows share the pool for fireworks and
 * sparkles. Everything fades by shrinking, so the pool needs no sorting and no transparency, except the sparks: glowing
 * points that blend into the sky and fade by dimming.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  CylinderGeometry,
  Euler,
  ExtrudeGeometry,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Shape as OutlineShape,
  Vector3,
  type BufferGeometry,
} from 'three'

import type { Game } from '../game/game'
import { seatPoint } from '../game/machines'
import { lerp, localX, localZ, TAU } from '../game/math'
import { CELL, HALF, LOOSE_KINDS, MACHINE_KINDS, MACHINE_SPECS, SURFACE_INDEX } from '../game/model'
import type { LooseKind, MachineKind, Sim, SimEvent, Terrain } from '../game/model'
import { FORMS, LOTS } from '../game/map'
import { groundY } from '../game/world'
import { LOAD_COLOUR } from './look'
import { giveColours } from './preload'

export const POOL_SIZE = 640

export const SHAPES = ['blob', 'star', 'coin', 'chip', 'spark'] as const
export type ParticleShape = (typeof SHAPES)[number]
const SHAPE_INDEX: Record<ParticleShape, number> = { blob: 0, star: 1, coin: 2, chip: 3, spark: 4 }
const SPARK = SHAPE_INDEX.spark

/** What a particle is born with. Speeds are metres a second; it shrinks to nothing over its last third. */
export interface Spawn {
  shape: ParticleShape
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  /** Width in metres. */
  size: number
  colour: string
  life: number
  /** Downward acceleration, m/s squared. */
  gravity: number
  /** Share of its speed lost each second. */
  drag: number
  /** How much bigger it is at the end of its life than at the start. */
  grow: number
  /** Turns a second, for stars, coins and chips. */
  spin: number
}

const colours = new Map<string, Color>()
const colourOf = (css: string): Color => {
  let c = colours.get(css)
  if (c === undefined) {
    c = new Color(css)
    colours.set(css, c)
  }
  return c
}

/** The pool: arrays, a cursor, and `spawn`, which overwrites the oldest when it is full. */
export class Pool {
  readonly px = new Float32Array(POOL_SIZE)
  readonly py = new Float32Array(POOL_SIZE)
  readonly pz = new Float32Array(POOL_SIZE)
  readonly vx = new Float32Array(POOL_SIZE)
  readonly vy = new Float32Array(POOL_SIZE)
  readonly vz = new Float32Array(POOL_SIZE)
  readonly size = new Float32Array(POOL_SIZE)
  readonly life = new Float32Array(POOL_SIZE)
  readonly age = new Float32Array(POOL_SIZE).fill(1)
  readonly gravity = new Float32Array(POOL_SIZE)
  readonly drag = new Float32Array(POOL_SIZE)
  readonly grow = new Float32Array(POOL_SIZE)
  readonly spin = new Float32Array(POOL_SIZE)
  readonly phase = new Float32Array(POOL_SIZE)
  readonly colour = new Float32Array(POOL_SIZE * 3)
  readonly shape = new Uint8Array(POOL_SIZE)
  private cursor = 0

  spawn(s: Spawn): void {
    const i = this.cursor
    this.cursor = (this.cursor + 1) % POOL_SIZE
    this.px[i] = s.x
    this.py[i] = s.y
    this.pz[i] = s.z
    this.vx[i] = s.vx
    this.vy[i] = s.vy
    this.vz[i] = s.vz
    this.size[i] = s.size
    this.life[i] = s.life
    this.age[i] = 0
    this.gravity[i] = s.gravity
    this.drag[i] = s.drag
    this.grow[i] = s.grow
    this.spin[i] = s.spin
    this.phase[i] = Math.random() * TAU
    const c = colourOf(s.colour)
    this.colour[i * 3] = c.r
    this.colour[i * 3 + 1] = c.g
    this.colour[i * 3 + 2] = c.b
    this.shape[i] = SHAPE_INDEX[s.shape]
  }

  /** Moves everything on by `dt` seconds. */
  step(dt: number): void {
    for (let i = 0; i < POOL_SIZE; i++) {
      if (this.age[i] >= this.life[i]) continue
      this.age[i] += dt
      const keep = Math.exp(-this.drag[i] * dt)
      this.vx[i] *= keep
      this.vz[i] *= keep
      this.vy[i] = this.vy[i] * keep - this.gravity[i] * dt
      this.px[i] += this.vx[i] * dt
      this.py[i] += this.vy[i] * dt
      this.pz[i] += this.vz[i] * dt
    }
  }

  alive(): number {
    let n = 0
    for (let i = 0; i < POOL_SIZE; i++) if (this.age[i] < this.life[i]) n++
    return n
  }
}

// ---------------------------------------------------------------------------------------
// Emitters: small helpers that put a handful of particles in the pool.

const rnd = (a: number, b: number) => a + Math.random() * (b - a)
const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]

const BRIGHT = ['#ff5e5e', '#ffd23f', '#5ec8ff', '#7fe07a', '#ff6fa8', '#ffffff', '#ff9f43']
const STAR_GOLD = '#ffd23f'

/** The dust a bit of ground gives: its stuff's colour, a little paler. */
const dustColour = (kind: LooseKind) => '#' + colourOf(LOAD_COLOUR[kind]).clone().lerp(new Color('#ffffff'), 0.28).getHexString()

/** A puff of round bits flying up and out. */
export function puff(pool: Pool, count: number, x: number, y: number, z: number, colour: string, o: { speed?: number; up?: number; size?: number; life?: number; grow?: number; gravity?: number } = {}): void {
  const speed = o.speed ?? 1.4
  for (let i = 0; i < count; i++) {
    const a = Math.random() * TAU
    const v = rnd(0.4, 1) * speed
    pool.spawn({ shape: 'blob', x: x + rnd(-0.2, 0.2), y, z: z + rnd(-0.2, 0.2), vx: Math.cos(a) * v, vy: rnd(0.5, 1) * (o.up ?? 2), vz: Math.sin(a) * v, size: (o.size ?? 0.4) * rnd(0.7, 1.2), colour, life: (o.life ?? 0.7) * rnd(0.8, 1.2), gravity: o.gravity ?? 3, drag: 1.5, grow: o.grow ?? 0.4, spin: 0 })
  }
}

/** Stars thrown up and out. */
export function stars(pool: Pool, count: number, x: number, y: number, z: number, o: { speed?: number; up?: number; size?: number; colour?: string } = {}): void {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * TAU
    const v = rnd(0.3, 1) * (o.speed ?? 3)
    pool.spawn({ shape: 'star', x, y, z, vx: Math.cos(a) * v, vy: rnd(0.6, 1) * (o.up ?? 7), vz: Math.sin(a) * v, size: (o.size ?? 0.7) * rnd(0.8, 1.2), colour: o.colour ?? STAR_GOLD, life: rnd(0.9, 1.4), gravity: 9, drag: 0.4, grow: 1, spin: rnd(-1.5, 1.5) })
  }
}

/** Coins hopping up. */
export function coins(pool: Pool, count: number, x: number, y: number, z: number): void {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * TAU
    pool.spawn({ shape: 'coin', x, y: y + 0.5, z, vx: Math.cos(a) * rnd(0.3, 1.6), vy: rnd(6, 8), vz: Math.sin(a) * rnd(0.3, 1.6), size: 0.6, colour: '#ffc929', life: rnd(0.9, 1.2), gravity: 14, drag: 0.3, grow: 1, spin: rnd(1.2, 2.2) })
  }
}

/** Bits of one colour sprayed out and up: a splash. They stop within `speed / drag` metres. */
export function sphereBurst(pool: Pool, count: number, x: number, y: number, z: number, colour: string, speed: number, shape: ParticleShape, size: number, life: number, gravity: number, drag: number): void {
  for (let i = 0; i < count; i++) {
    // Even-ish points on a sphere.
    const u = rnd(-1, 1)
    const a = Math.random() * TAU
    const r = Math.sqrt(1 - u * u)
    const v = speed * rnd(0.85, 1)
    pool.spawn({ shape, x, y, z, vx: Math.cos(a) * r * v, vy: u * v, vz: Math.sin(a) * r * v, size: size * rnd(0.8, 1.2), colour, life: life * rnd(0.85, 1.15), gravity, drag, grow: 1, spin: shape === 'blob' ? 0 : rnd(-2, 2) })
  }
}

/** How far a firework's sparks spread, in metres. */
export const FIREWORK_REACH = 4

/** A flash of white light and a ball of sparks of one colour that spreads about `FIREWORK_REACH` metres, hangs and falls, with an inner ball of gold. */
export function fireworkBurst(pool: Pool, x: number, y: number, z: number, colour: string): void {
  pool.spawn({ shape: 'spark', x, y, z, vx: 0, vy: 0, vz: 0, size: 1.4, colour: '#fff0c0', life: 0.25, gravity: 0, drag: 0, grow: 1.3, spin: 0 })
  sphereBurst(pool, 46, x, y, z, colour, FIREWORK_REACH * 1.7, 'spark', 0.34, 1.6, 2, 1.7)
  sphereBurst(pool, 16, x, y, z, '#ffe6a0', FIREWORK_REACH * 0.9, 'spark', 0.26, 1.2, 2, 1.7)
}

/** The bright head of a rocket on its way up. */
export function rocketTrail(pool: Pool, x: number, y: number, z: number): void {
  pool.spawn({ shape: 'spark', x, y, z, vx: rnd(-0.3, 0.3), vy: -1, vz: rnd(-0.3, 0.3), size: 0.36, colour: '#ffd98a', life: 0.5, gravity: 0, drag: 0, grow: 0.3, spin: 0 })
}

// ---------------------------------------------------------------------------------------
// The component.

const GRAVITY = 9
/** Particles a second from a full stream. */
const STREAM_RATE = 34
/** The thick streams drawn as a column. */
const COLUMNS = 6
const COLUMN_FROM = 0.5

function starGeometry(): BufferGeometry {
  const outline = new OutlineShape()
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 0.5 : 0.22
    const a = (i / 10) * TAU + Math.PI / 2
    if (i === 0) outline.moveTo(Math.cos(a) * r, Math.sin(a) * r)
    else outline.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  outline.closePath()
  const g = new ExtrudeGeometry(outline, { depth: 0.18, bevelEnabled: false })
  g.translate(0, 0, -0.09)
  return g
}

/** The ground's bare dust colour under (x, z), or null where there is grass or road. */
function dustAt(t: Terrain, x: number, z: number): string | null {
  const ix = Math.round((x + HALF) / CELL)
  const iz = Math.round((z + HALF) / CELL)
  const side = 2 * HALF / CELL + 1
  if (ix < 0 || iz < 0 || ix >= side || iz >= side) return null
  const i = ix + iz * side
  if (t.surface[i] !== SURFACE_INDEX.soft && t.loose[i] < 0.02) return null
  if (t.turf[i] > 0.6) return null
  return dustColour(t.loose[i] < 0.02 ? 'dirt' : LOOSE_KINDS[t.kind[i]])
}

const matrix = new Matrix4()
const quat = new Quaternion()
const euler = new Euler()
const pos = new Vector3()
const scale = new Vector3()
const up = new Vector3(0, 1, 0)
const dir = new Vector3()
const tint = new Color()
/** The live particles of each shape this frame. */
const counts: number[] = SHAPES.map(() => 0)

/** The grow-and-shrink every particle follows: a quick pop in, a long fade out. */
const lifeCurve = (u: number) => Math.min(u / 0.12, 1) * Math.min((1 - u) / 0.35, 1)

/** How bright a spark is over its life: a flash in, a long fade out, a twinkle all along. */
export const sparkGlow = (u: number, phase: number) => Math.min(u / 0.04, 1) * (1 - u) ** 1.5 * (0.8 + 0.2 * Math.sin(u * 60 + phase))

export function Effects({ game, pool }: { game: Game; pool: Pool }) {
  const meshes = useRef<(InstancedMesh | null)[]>([])
  const columns = useRef<InstancedMesh | null>(null)
  const geometries = useMemo<BufferGeometry[]>(() => {
    const coin = new CylinderGeometry(0.5, 0.5, 0.16, 14)
    coin.rotateX(Math.PI / 2)
    return [new IcosahedronGeometry(0.5, 0), starGeometry(), coin, new BoxGeometry(1, 0.05, 0.6), new IcosahedronGeometry(0.5, 1)]
  }, [])
  const materials = useMemo(
    () => [
      new MeshBasicMaterial(),
      new MeshBasicMaterial({ toneMapped: false }),
      new MeshBasicMaterial({ toneMapped: false }),
      new MeshBasicMaterial(),
      new MeshBasicMaterial({ toneMapped: false, transparent: true, blending: AdditiveBlending, depthWrite: false }),
    ],
    [],
  )
  const columnGeo = useMemo(() => new CylinderGeometry(0.62, 1, 1, 10, 1, true), [])
  const columnMat = useMemo(() => new MeshBasicMaterial({ transparent: true, opacity: 0.85, depthWrite: false }), [])
  const memo = useMemo(
    () => ({
      streams: [] as number[],
      landed: [] as number[],
      rolls: new Map<MachineKind, Roll>(),
      confetti: 0,
    }),
    [],
  )

  useEffect(
    () => () => {
      for (const g of geometries) g.dispose()
      for (const m of materials) m.dispose()
      columnGeo.dispose()
      columnMat.dispose()
    },
    [geometries, materials, columnGeo, columnMat],
  )

  useFrame((_, delta) => {
    const sim: Sim = game.sim
    const dt = game.paused || game.screen === 'shop' ? 0 : Math.min(delta, 0.1)
    if (dt > 0) {
      emitStreams(pool, sim, dt, memo)
      for (const e of game.events) emitEvent(pool, sim, e)
      emitDust(pool, sim, memo.rolls)
      emitParty(pool, sim, dt, memo)
      pool.step(dt)
    }
    // Draw: each shape's live particles packed into its own instanced mesh.
    counts.fill(0)
    for (let i = 0; i < POOL_SIZE; i++) {
      if (pool.age[i] >= pool.life[i]) continue
      const u = pool.age[i] / pool.life[i]
      const shape = pool.shape[i]
      // A spark keeps its size and dims; everything else shrinks away.
      const glow = shape === SPARK ? sparkGlow(u, pool.phase[i]) : 1
      const s = pool.size[i] * lerp(1, pool.grow[i], u) * (shape === SPARK ? 1 : lifeCurve(u))
      const mesh = meshes.current[shape]!
      const k = counts[shape]++
      pos.set(pool.px[i], pool.py[i], pool.pz[i])
      if (shape === 0 || shape === SPARK) quat.identity()
      else {
        const a = pool.spin[i] * pool.age[i] * TAU + pool.phase[i]
        quat.setFromEuler(euler.set(shape === 2 ? 0 : a * 0.7, a, shape === 2 ? 0 : a * 0.4))
      }
      matrix.compose(pos, quat, scale.setScalar(s))
      mesh.setMatrixAt(k, matrix)
      mesh.setColorAt(k, tint.setRGB(pool.colour[i * 3] * glow, pool.colour[i * 3 + 1] * glow, pool.colour[i * 3 + 2] * glow))
    }
    for (let shape = 0; shape < SHAPES.length; shape++) {
      const mesh = meshes.current[shape]!
      mesh.count = counts[shape]
      mesh.visible = counts[shape] > 0
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true
    }
    // Thick streams as tapered columns.
    let c = 0
    const t = game.clock
    for (const st of sim.streams) {
      if (st.rate < COLUMN_FROM || c >= COLUMNS) continue
      dir.set(st.toX - st.fromX, st.toY - st.fromY, st.toZ - st.fromZ)
      const len = dir.length()
      if (len < 0.05) continue
      const wobble = 1 + 0.08 * Math.sin(t * 22 + c)
      pos.set((st.fromX + st.toX) / 2, (st.fromY + st.toY) / 2, (st.fromZ + st.toZ) / 2)
      quat.setFromUnitVectors(up, dir.divideScalar(len))
      const r = (0.1 + 0.26 * st.rate) * wobble
      matrix.compose(pos, quat, scale.set(r, len, r))
      columns.current!.setMatrixAt(c, matrix)
      columns.current!.setColorAt(c, colourOf(st.stuff === 'water' ? '#6fd0ff' : LOAD_COLOUR[st.stuff]))
      c++
    }
    columns.current!.count = c
    columns.current!.visible = c > 0
    columns.current!.instanceMatrix.needsUpdate = true
    if (columns.current!.instanceColor !== null) columns.current!.instanceColor.needsUpdate = true
  })

  return (
    <>
      {SHAPES.map((shape, i) => (
        <instancedMesh key={shape} ref={(m) => {
          meshes.current[i] = m
          giveColours(m)
        }} args={[geometries[i], materials[i], POOL_SIZE]} frustumCulled={false} visible={false} />
      ))}
      <instancedMesh
        ref={(m) => {
          columns.current = m
          giveColours(m)
        }}
        args={[columnGeo, columnMat, COLUMNS]} frustumCulled={false} visible={false} />
    </>
  )
}

interface Roll {
  l: number
  r: number
  accL: number
  accR: number
}
interface Memo {
  streams: number[]
  landed: number[]
  rolls: Map<MachineKind, Roll>
  confetti: number
}

/** Stuff falling from every stream in its own colour, landing where the stream says, and a puff there. */
function emitStreams(pool: Pool, sim: Sim, dt: number, memo: Memo): void {
  sim.streams.forEach((st, i) => {
    memo.streams[i] = (memo.streams[i] ?? 0) + STREAM_RATE * st.rate * dt
    memo.landed[i] = (memo.landed[i] ?? 0) + dt
    const colour = st.stuff === 'water' ? '#6fd0ff' : LOAD_COLOUR[st.stuff]
    const drop = Math.max(st.fromY - st.toY, 0.3)
    const flight = Math.min(Math.max(Math.sqrt((2 * drop) / GRAVITY), 0.18), 1)
    while (memo.streams[i] >= 1) {
      memo.streams[i] -= 1
      const jx = rnd(-0.18, 0.18)
      const jz = rnd(-0.18, 0.18)
      pool.spawn({
        shape: 'blob',
        x: st.fromX + jx,
        y: st.fromY,
        z: st.fromZ + jz,
        vx: (st.toX - st.fromX) / flight,
        vy: (st.toY - st.fromY + 0.5 * GRAVITY * flight * flight) / flight,
        vz: (st.toZ - st.fromZ) / flight,
        size: rnd(0.16, 0.3) * (st.stuff === 'water' ? 0.8 : 1),
        colour,
        life: flight,
        gravity: GRAVITY,
        drag: 0,
        grow: 1,
        spin: 0,
      })
    }
    if (memo.landed[i] > 0.14 && st.rate > 0.05) {
      memo.landed[i] = 0
      if (st.stuff === 'water') puff(pool, 2, st.toX, st.toY + 0.1, st.toZ, '#bfe9ff', { speed: 1.2, up: 2.2, size: 0.28, life: 0.5 })
      else puff(pool, 2, st.toX, st.toY + 0.1, st.toZ, dustColour(st.stuff), { speed: 1.2, up: 1.4, size: 0.4, grow: 1.6 })
    }
  })
}

/** One event's particles. */
function emitEvent(pool: Pool, sim: Sim, e: SimEvent): void {
  switch (e.kind) {
    case 'bite':
      puff(pool, 7, e.x, e.y + 0.2, e.z, dustColour(e.stuff), { speed: 1.6, up: 2.4, size: 0.45, grow: 1.4 })
      break
    case 'dump':
    case 'tip':
      puff(pool, 6, e.x, e.y + 0.2, e.z, dustColour(e.stuff), { speed: 1.8, up: 2, size: 0.5, grow: 1.5 })
      break
    case 'landed':
      puff(pool, 4, e.x, e.y + 0.2, e.z, dustColour(e.stuff), { speed: 1.4, up: 1.6, size: 0.4, grow: 1.5 })
      break
    case 'coin':
      coins(pool, Math.min(e.amount, 5), e.x, e.y, e.z)
      break
    case 'pick':
      puff(pool, 4, e.x, e.y + 0.3, e.z, '#f3ead8', { speed: 1, up: 1.8, size: 0.3 })
      break
    case 'drop':
      puff(pool, 6, e.x, e.y + 0.2, e.z, '#f3ead8', { speed: 1.8, up: 1.6, size: 0.4, grow: 1.6 })
      break
    case 'place':
      puff(pool, 8, e.x, e.y + 0.3, e.z, '#fff4dc', { speed: 2.2, up: 2.4, size: 0.45, grow: 1.6 })
      stars(pool, 3, e.x, e.y + 1.2, e.z, { speed: 2, up: 5, size: 0.55 })
      break
    case 'rolled':
      puff(pool, 4, e.x, groundY(sim, e.x, e.z) + 0.2, e.z, '#d8d8dc', { speed: 2, up: 1, size: 0.55, grow: 1.8, life: 0.8 })
      break
    case 'stomp':
      puff(pool, 6, e.x, groundY(sim, e.x, e.z) + 0.2, e.z, '#e2cfa8', { speed: 2.6, up: 1.2, size: 0.5, grow: 1.8 })
      break
    case 'push':
      puff(pool, 3, e.x, groundY(sim, e.x, e.z) + 0.3, e.z, '#e2cfa8', { speed: 1.6, up: 1.2, size: 0.5, grow: 1.6 })
      break
    case 'pour':
      puff(pool, 4, e.x, groundY(sim, e.x, e.z) + 0.3, e.z, '#b8bbc2', { speed: 1.4, up: 1.4, size: 0.45, grow: 1.5 })
      break
    case 'mixed':
      stars(pool, 5, e.x, groundY(sim, e.x, e.z) + 3.4, e.z, { speed: 2.5, up: 5 })
      break
    case 'splash':
      sphereBurst(pool, 14, e.x, groundY(sim, e.x, e.z) + 0.2, e.z, '#9fdcff', 4, 'blob', 0.3, 0.8, 9, 1.1)
      break
    case 'set': {
      const lot = LOTS[FORMS[e.form].lot]
      stars(pool, 6, lot.x, 1.2, lot.z, { speed: 3.5, up: 6 })
      break
    }
    case 'plantDone':
      stars(pool, 4, e.plant === 'saw' ? 36 : e.plant === 'press' ? -18 : -14, 4, e.plant === 'saw' ? 14 : e.plant === 'press' ? -9 : -22, { speed: 2.5, up: 5 })
      break
    case 'stepDone':
      stars(pool, 9, e.x, e.y + 1.5, e.z, { speed: 3.5, up: 8 })
      break
    case 'jobDone': {
      const p = seatPoint(sim.machines[sim.active])
      stars(pool, 26, p.x, p.y + 1, p.z, { speed: 5, up: 11, size: 0.9 })
      for (let i = 0; i < 12; i++) stars(pool, 1, p.x, p.y + 1, p.z, { speed: 6, up: 8, size: 0.6, colour: pick(BRIGHT) })
      break
    }
    case 'hop': {
      const p = seatPoint(sim.machines[e.from])
      stars(pool, 5, p.x, p.y + 0.8, p.z, { speed: 2.5, up: 4, size: 0.5 })
      break
    }
    case 'moveIn':
      stars(pool, 8, e.x, groundY(sim, e.x, e.z) + 2.6, e.z, { speed: 3, up: 6 })
      break
    case 'party':
      if (sim.party !== null) for (let i = 0; i < 40; i++) confettiBit(pool, sim.party.x, sim.party.z, 6, 2)
      break
    case 'honk':
    case 'uhuh':
    case 'ack':
    case 'comes':
    case 'plantStart':
    case 'plantThump':
    case 'water':
    case 'wish':
    case 'chapterDone':
    case 'fireworks':
    case 'hint':
      break
  }
}

/** One bit of confetti, raining down round a place from above. */
function confettiBit(pool: Pool, x: number, z: number, spread: number, fall: number): void {
  const a = Math.random() * TAU
  const r = Math.sqrt(Math.random()) * spread
  pool.spawn({ shape: 'chip', x: x + Math.cos(a) * r, y: rnd(9, 16), z: z + Math.sin(a) * r, vx: rnd(-0.8, 0.8), vy: -fall * rnd(0.8, 1.3), vz: rnd(-0.8, 0.8), size: rnd(0.3, 0.5), colour: pick(BRIGHT), life: rnd(5, 7), gravity: 0, drag: 0.2, grow: 1, spin: rnd(0.8, 2) })
}

/** Confetti all through a party. */
function emitParty(pool: Pool, sim: Sim, dt: number, memo: Memo): void {
  if (sim.party === null) {
    memo.confetti = 0
    return
  }
  memo.confetti += dt * 22
  while (memo.confetti >= 1) {
    memo.confetti -= 1
    confettiBit(pool, sim.party.x, sim.party.z, 12, 2.2)
  }
}

/** Dust where a machine's tracks or tyres roll over bare ground. */
function emitDust(pool: Pool, sim: Sim, rolls: Memo['rolls']): void {
  for (const kind of MACHINE_KINDS) {
    const m = sim.machines[kind]
    let r = rolls.get(kind)
    if (r === undefined) {
      r = { l: m.rollL, r: m.rollR, accL: 0, accR: 0 }
      rolls.set(kind, r)
    }
    const dl = m.rollL - r.l
    const dr = m.rollR - r.r
    r.l = m.rollL
    r.r = m.rollR
    if (!m.unlocked || kind === 'tower') continue
    const spec = MACHINE_SPECS[kind]
    for (const side of [1, -1] as const) {
      const moved = side === 1 ? dl : dr
      // A jump (a machine put somewhere) is not rolling.
      if (Math.abs(moved) > 3 || Math.abs(moved) < 1e-4) continue
      const acc = (side === 1 ? r.accL : r.accR) + Math.abs(moved)
      if (side === 1) r.accL = acc
      else r.accR = acc
      if (acc < 1.3) continue
      if (side === 1) r.accL = 0
      else r.accR = 0
      const lz = (moved > 0 ? -1 : 1) * spec.length * 0.42
      const lx = side * spec.width * 0.4
      const x = localX(m.x, m.yaw, lx, lz)
      const z = localZ(m.z, m.yaw, lx, lz)
      const colour = dustAt(sim.terrain, x, z)
      if (colour === null) continue
      pool.spawn({ shape: 'blob', x, y: groundY(sim, x, z) + 0.15, z, vx: rnd(-0.5, 0.5), vy: rnd(0.8, 1.6), vz: rnd(-0.5, 0.5), size: rnd(0.45, 0.7), colour, life: rnd(0.7, 1.1), gravity: -0.2, drag: 1.2, grow: 2.2, spin: 0 })
    }
  }
}
