import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, type ReactNode } from 'react'
import { Group, Mesh } from 'three'

import type { Game } from '../game/game'
import { clamp01, easeAngle } from '../game/math'
import { mulberry32 } from '../game/random'
import { NODE_MAX, REGROW, windStrength, type Node, type NodeKind, type Sim } from '../game/sim'
import { Flat, Glow, Shiny, dyeHex, palette, refAt, show } from './look'
import { Synced } from './Synced'

/** The trunk under every crown. */
const TRUNK_H = 1.3
/** Where the sheep's body floats above its feet. */
const SHEEP_BODY_Y = 0.98
const SHEEP_HOP_FOR = 0.4
const SHEEP_HOP_H = 0.5
/** The legs of a sheep, seen from above: front and back, left and right. */
const LEGS: readonly [number, number][] = [
  [0.4, 0.33],
  [0.4, -0.33],
  [-0.4, 0.33],
  [-0.4, -0.33],
]
/** A thing just hit shakes this long, this fast. */
const WOBBLE_FOR = 0.35
const WOBBLE_HZ = 25

/** Every node on the meadow, one model each, keyed by id so each keeps its own animation. */
export function Nodes({ sim, game }: { sim: Sim; game: Game }) {
  return <Synced list={() => sim.nodes} render={(n) => <NodeModel key={n.id} sim={sim} game={game} node={n} />} />
}

/** The quick shake of something just hit: it dies out over WOBBLE_FOR. */
function wobble(sim: Sim, hitAt: number) {
  const since = sim.time - hitAt
  if (hitAt < 0 || since >= WOBBLE_FOR) return 0
  return 0.15 * Math.sin(since * Math.PI * 2 * WOBBLE_HZ) * (1 - since / WOBBLE_FOR)
}

/** How far something alive leans right now: a slow sway that the wind widens, and a steady lean with it. */
function lean(sim: Sim, x: number, z: number, amount: number) {
  const wind = windStrength(sim)
  return (amount + 0.3 * wind) * Math.sin(sim.time * 2 + x * 0.7 + z * 1.3) + 0.15 * wind
}

/** How far a bare node has grown back, 0 to 1. */
function regrowth(sim: Sim, node: Node) {
  return node.regrowAt < 0 ? 0 : clamp01(1 - (node.regrowAt - sim.time) / REGROW[node.kind])
}

const MODEL: Record<NodeKind, (props: { sim: Sim; node: Node }) => ReactNode> = { tree: Tree, rock: Cluster, ore: Cluster, sheep: Sheep, flowers: FlowerPatch, lostbanner: LostBanner }

/** One node: its model, the tap that sends the hero, and the soft ring under it while the hero is on the way. */
function NodeModel({ sim, game, node }: { sim: Sim; game: Game; node: Node }) {
  const root = useRef<Group>(null!)
  const ring = useRef<Mesh>(null!)
  const Model = MODEL[node.kind]
  useFrame(() => {
    root.current.position.set(node.x, 0, node.z)
    const job = sim.hero.job
    const working = job !== null && job.kind === 'gather' && job.id === node.id
    const heading = sim.hero.focus === node.id && !working
    show(ring.current, heading)
    if (heading) ring.current.scale.setScalar(1 + 0.1 * Math.sin(sim.time * 6))
  })
  return (
    <group
      ref={root}
      onPointerDown={(e) => {
        e.stopPropagation()
        game.tapNode(node.id)
      }}
    >
      <mesh ref={ring} position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.4, 1.75, 24]} />
        <Glow color={palette.cellRing} opacity={0.5} />
      </mesh>
      <Model sim={sim} node={node} />
    </group>
  )
}

interface CrownPiece {
  x: number
  y: number
  z: number
  r: number
  /** A cone's height; zero for a round piece. */
  h: number
  colour: string
}

/**
 * A tree: a trunk and two or three stacked cones (a pine) or icosahedrons (a round
 * tree). The crown shrinks a step per log taken; bare, only the stump is left, with a
 * sprout that grows as the tree grows back. It sways with the wind and shakes when hit.
 */
function Tree({ sim, node }: { sim: Sim; node: Node }) {
  const sway = useRef<Group>(null!)
  const whole = useRef<Group>(null!)
  const crown = useRef<Group>(null!)
  const stump = useRef<Group>(null!)
  const sprout = useRef<Group>(null!)
  const shape = useMemo(() => {
    const rand = mulberry32(node.seed)
    const pine = rand() < 0.5
    const crownH = 3.5 + rand() - TRUNK_H
    const layers = 2 + Math.floor(rand() * 2)
    const green = Math.floor(rand() * 3)
    const step = crownH / (layers + 0.5)
    const pieces: CrownPiece[] = Array.from({ length: layers }, (_, i) => {
      const colour = palette.leaves[(green + i) % 3]!
      if (pine) return { x: 0, y: i * step + step * 0.75, z: 0, r: 1.5 - 0.35 * i, h: step * 1.5, colour }
      return { x: (rand() - 0.5) * 0.5, y: crownH * ((i + 0.6) / (layers + 0.4)), z: (rand() - 0.5) * 0.5, r: 1.35 - 0.3 * i, h: 0, colour }
    })
    return { pine, pieces }
  }, [node.seed])
  useFrame(() => {
    const bare = node.left === 0
    show(whole.current, !bare)
    show(stump.current, bare)
    if (bare) sprout.current.scale.setScalar(0.1 + 0.9 * regrowth(sim, node))
    else crown.current.scale.setScalar(0.4 + (0.6 * node.left) / NODE_MAX.tree)
    sway.current.rotation.z = lean(sim, node.x, node.z, 0.03) + wobble(sim, node.hitAt)
  })
  return (
    <group ref={sway}>
      <group ref={whole}>
        <mesh position={[0, TRUNK_H / 2, 0]} castShadow>
          <cylinderGeometry args={[0.22, 0.3, TRUNK_H, 6]} />
          <Flat color={palette.trunk} />
        </mesh>
        <group ref={crown} position={[0, TRUNK_H, 0]}>
          {shape.pieces.map((p, i) => (
            <mesh key={i} position={[p.x, p.y, p.z]} castShadow>
              {shape.pine ? <coneGeometry args={[p.r, p.h, 6]} /> : <icosahedronGeometry args={[p.r, 0]} />}
              <Flat color={p.colour} />
            </mesh>
          ))}
        </group>
      </group>
      <group ref={stump}>
        <mesh position={[0, 0.25, 0]} castShadow>
          <cylinderGeometry args={[0.3, 0.38, 0.5, 6]} />
          <Flat color={palette.stump} />
        </mesh>
        <group ref={sprout} position={[0.25, 0.5, 0.15]}>
          <mesh position={[0, 0.3, 0]}>
            <coneGeometry args={[0.28, 0.7, 5]} />
            <Flat color={palette.leaves[1]} />
          </mesh>
        </group>
      </group>
    </group>
  )
}

/**
 * A rock or an ore rock: one chunk per unit, the big one in the middle, each taken
 * unit removing one. Ore chunks carry gold nuggets that go with them. Bare, a few
 * pebbles are left that grow back toward the regrow time.
 */
function Cluster({ sim, node }: { sim: Sim; node: Node }) {
  const ore = node.kind === 'ore'
  const root = useRef<Group>(null!)
  const chunks = useRef<Group[]>([])
  const pebbles = useRef<Group>(null!)
  const shape = useMemo(() => {
    const rand = mulberry32(node.seed)
    const chunks = Array.from({ length: NODE_MAX[node.kind] }, (_, i) => {
      const a = rand() * Math.PI * 2
      const d = i === 0 ? 0 : 0.7 + rand() * 0.4
      const r = (i === 0 ? 1.0 : 0.65) + rand() * 0.25
      const nuggets = Array.from({ length: 2 }, () => {
        const b = rand() * Math.PI * 2
        const up = rand() * 0.8 + 0.1
        const flat = Math.sqrt(1 - up * up) * r * 0.85
        return { x: Math.cos(b) * flat, y: up * r * 0.85, z: Math.sin(b) * flat }
      })
      return { x: Math.cos(a) * d, z: Math.sin(a) * d, r, rx: rand() * Math.PI, ry: rand() * Math.PI, dark: rand() < 0.4, nuggets }
    })
    const pebbles = Array.from({ length: 3 }, () => {
      const a = rand() * Math.PI * 2
      const d = rand() * 0.8
      return { x: Math.cos(a) * d, z: Math.sin(a) * d, r: 0.18 + rand() * 0.1, ry: rand() * Math.PI }
    })
    return { chunks, pebbles }
  }, [node.seed, node.kind])
  useFrame(() => {
    shape.chunks.forEach((_, i) => show(chunks.current[i]!, node.left > i))
    pebbles.current.scale.setScalar(node.left === 0 ? 0.2 + 0.8 * regrowth(sim, node) : 1e-4)
    root.current.rotation.z = wobble(sim, node.hitAt)
  })
  return (
    <group ref={root}>
      {shape.chunks.map((c, i) => (
        <group key={i} ref={refAt(chunks, i)} position={[c.x, c.r * 0.7, c.z]}>
          <mesh rotation={[c.rx, c.ry, 0]} castShadow>
            <dodecahedronGeometry args={[c.r, 0]} />
            <Flat color={ore ? palette.oreRock : c.dark ? palette.rockDark : palette.rock} />
          </mesh>
          {ore &&
            c.nuggets.map((n, j) => (
              <mesh key={j} position={[n.x, n.y, n.z]}>
                <dodecahedronGeometry args={[0.17, 0]} />
                <Shiny color={palette.oreGold} />
              </mesh>
            ))}
        </group>
      ))}
      <group ref={pebbles}>
        {shape.pebbles.map((p, i) => (
          <mesh key={i} position={[p.x, p.r * 0.5, p.z]} rotation={[0, p.ry, 0]}>
            <dodecahedronGeometry args={[p.r, 0]} />
            <Flat color={ore ? palette.oreRock : palette.rock} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

/**
 * A sheep: a woolly body with a black face, four short legs and a tail. It faces the
 * way it moves, hops when poked, waddles as it walks, grazes with a bob, lies on its
 * back with its legs wiggling when the wind rolled it, and is small and pink when shorn.
 */
function Sheep({ sim, node }: { sim: Sim; node: Node }) {
  const turn = useRef<Group>(null!)
  const body = useRef<Group>(null!)
  const white = useRef<Mesh>(null!)
  const pink = useRef<Mesh>(null!)
  const legs = useRef<Mesh[]>([])
  const last = useRef({ x: node.x, z: node.z, t: sim.time, facing: mulberry32(node.seed)() * Math.PI * 2 })
  useFrame(() => {
    const t = sim.time
    const m = last.current
    const dt = Math.max(0, t - m.t)
    const dx = node.x - m.x
    const dz = node.z - m.z
    const moving = Math.hypot(dx, dz) > 1e-4
    if (moving) m.facing = easeAngle(m.facing, Math.atan2(dz, dx), dt, 1 / 8)
    m.x = node.x
    m.z = node.z
    m.t = t
    const shorn = node.left === 0
    white.current.scale.setScalar(shorn ? 1e-4 : 1)
    pink.current.scale.setScalar(shorn ? 0.55 : 1e-4)
    const flipped = node.state === 'flipped'
    const hop = (t - node.hopAt) / SHEEP_HOP_FOR
    const rise = node.hopAt >= 0 && hop < 1 ? SHEEP_HOP_H * 4 * hop * (1 - hop) : 0
    turn.current.rotation.y = -m.facing
    turn.current.position.y = SHEEP_BODY_Y + rise + (flipped ? 0 : 0.04 * Math.sin(t * 3 + node.seed))
    body.current.rotation.z = flipped ? Math.PI : moving ? 0.08 * Math.sin(t * 12) : 0.03 * Math.sin(t * 2 + node.x * 0.7 + node.z * 1.3)
    body.current.rotation.x = wobble(sim, node.hitAt)
    legs.current.forEach((leg, i) => {
      leg.rotation.x = flipped ? 0.5 * Math.sin(t * Math.PI * 16 + i * 1.7) : 0
      leg.rotation.z = !flipped && moving ? 0.5 * Math.sin(t * 14 + i * Math.PI) : 0
    })
  })
  return (
    <group ref={turn} position={[0, SHEEP_BODY_Y, 0]}>
      <group ref={body}>
        <mesh ref={white} castShadow>
          <icosahedronGeometry args={[0.9, 1]} />
          <Flat color={palette.woolWhite} />
        </mesh>
        <mesh ref={pink} castShadow>
          <icosahedronGeometry args={[0.9, 1]} />
          <Flat color={palette.sheepPink} />
        </mesh>
        <mesh position={[0.78, 0.15, 0]}>
          <sphereGeometry args={[0.42, 8, 6]} />
          <Flat color={palette.sheepFace} />
        </mesh>
        {[-0.17, 0.17].map((z) => (
          <mesh key={z} position={[1.12, 0.28, z]}>
            <sphereGeometry args={[0.09, 6, 5]} />
            <Glow color={palette.woolWhite} />
          </mesh>
        ))}
        {LEGS.map(([x, z], i) => (
          <mesh key={i} ref={refAt(legs, i)} position={[x, -0.72, z]}>
            <boxGeometry args={[0.18, 0.55, 0.18]} />
            <Flat color={palette.sheepFace} />
          </mesh>
        ))}
        <mesh position={[-0.88, 0.15, 0]}>
          <sphereGeometry args={[0.17, 6, 5]} />
          <Flat color={palette.woolWhite} />
        </mesh>
      </group>
    </group>
  )
}

/**
 * A patch of flowers: six or seven stems with heads in the four dye colours. Picking a
 * unit takes half the heads; bare, every head grows back together toward the regrow time.
 */
function FlowerPatch({ sim, node }: { sim: Sim; node: Node }) {
  const stems = useRef<Group[]>([])
  const heads = useRef<Mesh[]>([])
  const shape = useMemo(() => {
    const rand = mulberry32(node.seed)
    const n = 6 + Math.floor(rand() * 2)
    const first = Math.floor(rand() * 4)
    return Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 + rand() * 0.8
      const d = 0.3 + rand() * 0.7
      return { x: Math.cos(a) * d, z: Math.sin(a) * d, h: 0.5 + rand() * 0.4, colour: dyeHex(first + i) }
    })
  }, [node.seed])
  useFrame(() => {
    const showing = Math.ceil((node.left * shape.length) / NODE_MAX.flowers)
    const size = node.left === 0 ? regrowth(sim, node) : 1
    shape.forEach((f, i) => {
      stems.current[i]!.rotation.z = lean(sim, node.x + f.x, node.z + f.z, 0.1) + wobble(sim, node.hitAt)
      heads.current[i]!.scale.setScalar(Math.max(1e-4, node.left > 0 ? (i < showing ? 1 : 0) : size))
    })
  })
  return (
    <group>
      {shape.map((f, i) => (
        <group key={i} ref={refAt(stems, i)} position={[f.x, 0, f.z]}>
          <mesh position={[0, f.h / 2, 0]}>
            <cylinderGeometry args={[0.03, 0.04, f.h, 5]} />
            <Flat color={palette.stem} />
          </mesh>
          <mesh
            ref={refAt(heads, i)}
            position={[0, f.h, 0]}
            castShadow
          >
            <sphereGeometry args={[0.17, 7, 6]} />
            <Flat color={f.colour} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/** A banner the wind took: its cloth on the grass, one edge flapping, and the gold stub of its pole beside it. */
function LostBanner({ sim, node }: { sim: Sim; node: Node }) {
  const cloth = useRef<Group>(null!)
  const angle = useMemo(() => mulberry32(node.seed)() * Math.PI * 2, [node.seed])
  useFrame(() => {
    const wind = windStrength(sim)
    const flap = 0.5 + 0.5 * Math.sin(sim.time * 4 + node.seed)
    // Turning the far edge up is a negative turn about X.
    cloth.current.rotation.x = -(0.1 + (0.3 + 0.6 * wind) * flap) - wobble(sim, node.hitAt)
  })
  return (
    <group rotation={[0, angle, 0]}>
      <group ref={cloth} position={[0, 0.06, -0.5]}>
        <mesh position={[0, 0, 0.5]} castShadow>
          <boxGeometry args={[1.6, 0.06, 1.0]} />
          <Flat color={dyeHex(node.colour)} />
        </mesh>
      </group>
      <mesh position={[-1.0, 0.15, -0.55]} rotation={[0, 0, 1.25]}>
        <cylinderGeometry args={[0.05, 0.05, 0.7, 6]} />
        <Shiny color={palette.gold} />
      </mesh>
      <mesh position={[-1.3, 0.28, -0.55]}>
        <sphereGeometry args={[0.1, 6, 5]} />
        <Shiny color={palette.gold} />
      </mesh>
    </group>
  )
}
