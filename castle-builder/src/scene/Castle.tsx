import { useFrame } from '@react-three/fiber'
import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Color, ExtrudeGeometry, Group, InstancedMesh, Mesh, MeshBasicMaterial, Object3D, Shape } from 'three'

import type { Game } from '../game/game'
import { ease } from '../game/math'
import {
  CELL,
  COLOURS,
  GOODS,
  GRID,
  HEIGHT,
  PAINTABLE,
  RECIPE,
  SIZE,
  STOREY_H,
  UNPAINTED,
  YARD_COL,
  YARD_ROW,
  canPlace,
  cellAt,
  cellCentre,
  cellIndex,
  chosenPiece,
  costEntries,
  ghostCell,
  inGrid,
  pieceById,
  pieceCentre,
  pieceTop,
  windStrength,
  type Good,
  type Piece,
  type PieceKind,
  type Sim,
  type Workshop,
} from '../game/sim'
import { BALCONY, Flat, Glow, GoodMesh, KEEP_RADIUS, Shiny, Tinted, WELL, daylight, dyeHex, keepHeight, palette, pileAt, refAt, setOpacity, show } from './look'
import { Synced } from './Synced'

/**
 * The castle: the keep, the yard with the goods piles and the well, every placed piece
 * with its auto-beauty, the placement helpers and the tap targets. Everything is read
 * from the sim in useFrame and never written; taps go to the Game.
 */

const scratch = new Object3D()
const DEG = Math.PI / 180

/** The placement pop: from nothing to 1.15 at 0.35 s, settled at 1 by 0.6 s; 1 outside that window. */
function pop(age: number) {
  if (age < 0 || age >= 0.6) return 1
  if (age < 0.35) {
    const u = 1 - age / 0.35
    return 1.15 * (1 - u * u * u)
  }
  const u = (age - 0.35) / 0.25
  return 1.15 - 0.15 * u * u * (3 - 2 * u)
}

interface Eased {
  v: number
  t: number
}
/** Eases a shown value toward its target over about `seconds`, timed off the sim clock so a pause holds it. */
function settle(m: Eased, target: number, time: number, seconds: number) {
  m.v = ease(m.v, target, Math.max(0, time - m.t), seconds / 4)
  m.t = time
  return m.v
}

const towerHeight = (p: Piece) => HEIGHT.tower + (p.storeys - 1) * STOREY_H
/** A castle roof is castle blue until the child paints it; a banner always wears its dye. */
const roofHex = (p: Piece) => (p.colour === UNPAINTED ? palette.castleRoof : dyeHex(p.colour))
/** The keep flies the colour of the banner placed last, or gold before there is one. */
function lastBannerHex(s: Sim) {
  for (let i = s.pieces.length - 1; i >= 0; i--) if (s.pieces[i]!.kind === 'banner') return dyeHex(s.pieces[i]!.colour)
  return palette.gold
}

/** A sim field as React state: re-renders on change only, for the rare things a re-render is right for (a paint, a new flag colour). */
function useSimValue<T>(read: () => T): T {
  const [v, setV] = useState(read)
  useFrame(() => {
    const n = read()
    if (n !== v) setV(n)
  })
  return v
}

// ------------------------------------------------------------------------ materials

/** True inside the placement ghost: every material turns see-through. */
const GhostContext = createContext(false)
type Finish = 'flat' | 'shiny' | 'iron' | 'glow'

/** The one material component the piece models use, so the ghost can swap all of them for a translucent one. */
function Mat({ color, finish = 'flat', opacity = 1 }: { color: string; finish?: Finish; opacity?: number }) {
  const ghost = useContext(GhostContext)
  if (ghost) return <meshStandardMaterial transparent opacity={0.45} flatShading color={color} depthWrite={false} />
  switch (finish) {
    case 'flat':
      return <Flat color={color} />
    case 'shiny':
      return <Shiny color={color} />
    case 'iron':
      return <Shiny color={color} iron />
    case 'glow':
      return <Glow color={color} opacity={opacity} />
  }
}

const WINDOW_DAY = new Color(palette.windowDay)
const WINDOW_NIGHT = new Color(palette.window)
/** One material for every window in the castle, lerped between day and evening once a frame by Castle. */
const windowGlow = new MeshBasicMaterial({ color: palette.windowDay })

/** A window pane facing +Z of its group: a box, with a half-round top when arched. */
function Window({ position, rotation = [0, 0, 0], w, h, arched = false }: { position: [number, number, number]; rotation?: [number, number, number]; w: number; h: number; arched?: boolean }) {
  const ghost = useContext(GhostContext)
  const pane = (geometry: ReactNode, at: [number, number, number], turn: [number, number, number]) =>
    ghost ? (
      <mesh position={at} rotation={turn}>
        {geometry}
        <meshStandardMaterial transparent opacity={0.45} flatShading color={palette.windowDay} depthWrite={false} />
      </mesh>
    ) : (
      <mesh position={at} rotation={turn} material={windowGlow}>
        {geometry}
      </mesh>
    )
  return (
    <group position={position} rotation={rotation}>
      {pane(<boxGeometry args={[w, h, 0.08]} />, [0, 0, 0], [0, 0, 0])}
      {arched && pane(<cylinderGeometry args={[w / 2, w / 2, 0.08, 8, 1, false, -Math.PI / 2, Math.PI]} />, [0, h / 2, 0], [-Math.PI / 2, 0, 0])}
    </group>
  )
}

/** A ridge roof: a triangle extruded along X, `length` long, `halfDepth` out from the ridge on each side, `height` tall. */
function ridgeGeometry(halfDepth: number, height: number, length: number) {
  const s = new Shape()
  s.moveTo(-halfDepth, 0)
  s.lineTo(halfDepth, 0)
  s.lineTo(0, height)
  s.closePath()
  const g = new ExtrudeGeometry(s, { depth: length, bevelEnabled: false })
  g.rotateY(Math.PI / 2)
  g.translate(-length / 2, 0, 0)
  return g
}
const ROOM_ROOF = ridgeGeometry(1.75, 1.0, 3.6)
const HALL_ROOF = ridgeGeometry(2.6, 1.6, 7.0)

// ---------------------------------------------------------------------- shared parts

/**
 * The two halves every piece model is built from: the body, which tilts 8 degrees and
 * sinks a tenth when the piece is broken, and the top (roof, battlements, caps), which
 * then lies tilted beside it. `topY` is read every frame, so a growing tower can move it.
 */
function Parts({ piece, topY, lay = true, body, top }: { piece: Piece; topY: () => number; lay?: boolean; body: ReactNode; top: ReactNode }) {
  const bodyRef = useRef<Group>(null!)
  const topRef = useRef<Group>(null!)
  useFrame(() => {
    const b = bodyRef.current
    const t = topRef.current
    const y = topY()
    if (piece.state !== 'broken') {
      b.rotation.z = 0
      b.position.y = 0
      t.position.set(0, y, 0)
      t.rotation.set(0, 0, 0)
      show(t, true)
      return
    }
    b.rotation.z = 8 * DEG
    b.position.y = -0.1 * y
    show(t, lay)
    t.position.set(1.5, 0.45, 1.5)
    t.rotation.set(0.5, 0.4, 0.7)
  })
  return (
    <>
      <group ref={bodyRef}>{body}</group>
      <group ref={topRef}>{top}</group>
    </>
  )
}

/** A flag on a pole: the cloth flaps with the sim clock and the whole thing leans with the wind. */
function Flag({ sim, color, size = 1 }: { sim: Sim; color: string; size?: number }) {
  const root = useRef<Group>(null!)
  const cloth = useRef<Group>(null!)
  useFrame(() => {
    const w = windStrength(sim)
    root.current.rotation.z = -0.45 * w
    cloth.current.rotation.y = Math.sin(sim.time * (4 + 6 * w)) * (0.2 + 0.5 * w)
    cloth.current.scale.x = 0.85 + 0.15 * Math.sin(sim.time * 7 + 1)
  })
  return (
    <group ref={root} scale={size}>
      <mesh position={[0, 0.7, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 1.4, 5]} />
        <Mat color={palette.gold} finish="shiny" />
      </mesh>
      <group ref={cloth} position={[0.02, 1.15, 0]}>
        <mesh position={[0.4, 0, 0]}>
          <boxGeometry args={[0.8, 0.5, 0.04]} />
          <Mat color={color} />
        </mesh>
      </group>
      <mesh position={[0, 1.45, 0]}>
        <sphereGeometry args={[0.1, 8, 6]} />
        <Mat color={palette.gold} finish="shiny" />
      </mesh>
    </group>
  )
}

/** A gold bell hanging from its pivot, swinging for 1.5 s after the last bong. */
function Bell({ sim, size }: { sim: Sim; size: number }) {
  const root = useRef<Group>(null!)
  useFrame(() => {
    const age = sim.time - sim.bongAt
    root.current.rotation.z = age >= 0 && age < 1.5 ? 0.8 * Math.sin(age * 14) * (1 - age / 1.5) : 0
  })
  return (
    <group ref={root} scale={size}>
      <mesh position={[0, -0.25, 0]}>
        <coneGeometry args={[0.26, 0.42, 8]} />
        <Mat color={palette.gold} finish="shiny" />
      </mesh>
      <mesh position={[0, -0.44, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.26, 0.05, 6, 10]} />
        <Mat color={palette.goldDark} finish="shiny" />
      </mesh>
      <mesh position={[0, -0.5, 0]}>
        <sphereGeometry args={[0.07, 6, 5]} />
        <Mat color={palette.goldDark} finish="shiny" />
      </mesh>
    </group>
  )
}

/** A small round turret: a wall end or corner grows one. */
function Turret({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 1.35, 0]} castShadow>
        <cylinderGeometry args={[0.55, 0.6, 2.7, 8]} />
        <Mat color={palette.stone} />
      </mesh>
      <mesh position={[0, 3.1, 0]} castShadow>
        <coneGeometry args={[0.72, 0.9, 8]} />
        <Mat color={palette.castleRoof} />
      </mesh>
      <mesh position={[0, 3.62, 0]}>
        <sphereGeometry args={[0.12, 8, 6]} />
        <Mat color={palette.gold} finish="shiny" />
      </mesh>
    </group>
  )
}

/** A flat coloured triangle hanging point down, facing +Z. */
function Pennant({ position, color }: { position: [number, number, number]; color: string }) {
  return (
    <mesh position={position} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[0.18, 0.18, 0.03, 3]} />
      <Mat color={color} />
    </mesh>
  )
}

// ----------------------------------------------------------------------------- keep

const KEEP_BATTLEMENTS = Array.from({ length: 12 }, (_, i) => (i / 12) * Math.PI * 2)
const KEEP_WINDOWS = [60, 120, 180, 240, 300]

/** The King's round tower at the origin: it grows a storey every few pieces, and carries his balcony, a bell and the flag. */
function Keep({ sim, game }: { sim: Sim; game: Game }) {
  const body = useRef<Mesh>(null!)
  const top = useRef<Group>(null!)
  const height = useRef<Eased>({ v: keepHeight(sim), t: sim.time })
  const flag = useSimValue(() => lastBannerHex(sim))
  useFrame(() => {
    const h = settle(height.current, keepHeight(sim), sim.time, 0.8)
    body.current.scale.y = h
    body.current.position.y = h / 2
    top.current.position.y = h
  })
  const r = KEEP_RADIUS + 0.02
  return (
    <group
      onPointerDown={(e) => {
        e.stopPropagation()
        game.tapKeep()
      }}
    >
      <mesh ref={body} castShadow receiveShadow>
        <cylinderGeometry args={[KEEP_RADIUS, KEEP_RADIUS, 1, 14]} />
        <Flat color={palette.stone} />
      </mesh>
      <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[KEEP_RADIUS + 0.25, KEEP_RADIUS + 0.45, 1, 14]} />
        <Flat color={palette.stoneBase} />
      </mesh>
      {/* Low windows on the sides and the back, never over the balcony. */}
      {KEEP_WINDOWS.map((deg) => (
        <Window key={deg} position={[Math.sin(deg * DEG) * r, 2.4, Math.cos(deg * DEG) * r]} rotation={[0, deg * DEG, 0]} w={0.36} h={0.55} arched />
      ))}
      {/* The balcony on the front: the King stands here (People draws him). */}
      <mesh position={[BALCONY.x, BALCONY.y - 0.12, BALCONY.z]} castShadow>
        <boxGeometry args={[1.6, 0.24, 0.8]} />
        <Flat color={palette.stoneShade} />
      </mesh>
      {[-0.72, 0.72].map((x) => (
        <mesh key={x} position={[x, BALCONY.y + 0.3, BALCONY.z + 0.34]}>
          <boxGeometry args={[0.08, 0.6, 0.08]} />
          <Flat color={palette.stoneShade} />
        </mesh>
      ))}
      <mesh position={[0, BALCONY.y + 0.6, BALCONY.z + 0.34]}>
        <boxGeometry args={[1.6, 0.08, 0.08]} />
        <Flat color={palette.stoneShade} />
      </mesh>
      <mesh position={[0, BALCONY.y + 0.75, KEEP_RADIUS - 0.04]}>
        <boxGeometry args={[0.8, 1.5, 0.12]} />
        <Flat color={palette.door} />
      </mesh>
      {/* The bell on the east side, under its own little roof. */}
      <group position={[KEEP_RADIUS + 0.55, 3.2, 0]}>
        {[-0.35, 0.35].map((z) => (
          <mesh key={z} position={[0, 0.5, z]}>
            <boxGeometry args={[0.1, 1.0, 0.1]} />
            <Flat color={palette.woodDark} />
          </mesh>
        ))}
        <mesh position={[0, 1.15, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
          <coneGeometry args={[0.7, 0.35, 4]} />
          <Flat color={palette.castleRoof} />
        </mesh>
        <group position={[0, 0.98, 0]}>
          <Bell sim={sim} size={0.8} />
        </group>
      </group>
      <group ref={top}>
        {/* Windows that ride up with the tower. */}
        {[30, 90, 150, 210, 270, 330].map((deg) => (
          <Window key={deg} position={[Math.sin(deg * DEG) * r, -1.5, Math.cos(deg * DEG) * r]} rotation={[0, deg * DEG, 0]} w={0.36} h={0.55} arched />
        ))}
        <mesh position={[0, 0.12, 0]}>
          <cylinderGeometry args={[KEEP_RADIUS + 0.2, KEEP_RADIUS, 0.3, 14]} />
          <Flat color={palette.stoneShade} />
        </mesh>
        {KEEP_BATTLEMENTS.map((a) => (
          <mesh key={a} position={[Math.sin(a) * (KEEP_RADIUS - 0.05), 0.5, Math.cos(a) * (KEEP_RADIUS - 0.05)]} rotation={[0, a, 0]} castShadow>
            <boxGeometry args={[0.55, 0.5, 0.4]} />
            <Flat color={palette.stone} />
          </mesh>
        ))}
        <mesh position={[0, 1.55, 0]} castShadow>
          <coneGeometry args={[KEEP_RADIUS - 0.15, 2.4, 14]} />
          <Flat color={palette.castleRoof} />
        </mesh>
        <mesh position={[0, 2.8, 0]}>
          <sphereGeometry args={[0.2, 8, 6]} />
          <Shiny color={palette.gold} />
        </mesh>
        <group position={[0, 2.9, 0]}>
          <Flag sim={sim} color={flag} />
        </group>
      </group>
    </group>
  )
}

// ----------------------------------------------------------------------------- yard

/** Where the six copies of a good sit in its pile: three on the ground, two on those, one on top. */
const HEAP: [number, number, number][] = [
  [-0.16, 0, -0.1],
  [0.16, 0, -0.1],
  [0, 0, 0.16],
  [-0.09, 0.3, 0.02],
  [0.1, 0.3, 0.06],
  [0, 0.58, 0.02],
]
const PILE_SCALE = 0.45
/** GoodMesh shapes centred on their middle need lifting onto the ground; planks and flowers already stand on it. */
const lift = (g: Good) => (g === 'planks' || g === 'flowers' ? 0 : 0.17)

/** One good's pile in the yard: as many copies as the yard holds, up to six, on a cobble disc. */
function Pile({ sim, good }: { sim: Sim; good: Good }) {
  const copies = useRef<Group[]>([])
  const at = pileAt(good)
  /** Cloth in the pile wears the colour the pot is making, the colour it flew in with. */
  const dye = useSimValue(() => sim.dye)
  useFrame(() => {
    const n = Math.min(HEAP.length, sim.store[good])
    copies.current.forEach((g, i) => show(g, i < n))
  })
  return (
    <group position={[at.x, 0.12, at.z]}>
      <mesh position={[0, 0.03, 0]} receiveShadow>
        <cylinderGeometry args={[0.36, 0.4, 0.06, 9]} />
        <Flat color={palette.cobbleDark} />
      </mesh>
      {HEAP.map((p, i) => (
        <group
          key={i}
          ref={refAt(copies, i)}
          position={[p[0], p[1] + lift(good) * PILE_SCALE + 0.06, p[2]]}
          rotation={[0, i * 0.9, 0]}
          scale={PILE_SCALE}
        >
          <GoodMesh good={good} colour={dye} />
        </group>
      ))}
    </group>
  )
}

/** The well in the corner of the yard: a stone ring, a wood roof on two posts, a bucket on its rope. */
function Well() {
  return (
    <group position={[WELL.x, 0.12, WELL.z]}>
      <mesh position={[0, 0.25, 0]} castShadow>
        <cylinderGeometry args={[0.5, 0.55, 0.5, 10]} />
        <Flat color={palette.stoneShade} />
      </mesh>
      <mesh position={[0, 0.47, 0]}>
        <cylinderGeometry args={[0.4, 0.4, 0.02, 10]} />
        <Glow color={palette.water2} />
      </mesh>
      <mesh position={[0, 0.52, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.47, 0.08, 5, 10]} />
        <Flat color={palette.stone} />
      </mesh>
      {[-0.45, 0.45].map((x) => (
        <mesh key={x} position={[x, 0.9, 0]} castShadow>
          <boxGeometry args={[0.1, 1.2, 0.1]} />
          <Flat color={palette.woodDark} />
        </mesh>
      ))}
      <mesh position={[0, 1.42, 0]}>
        <boxGeometry args={[1.0, 0.06, 0.06]} />
        <Flat color={palette.woodDark} />
      </mesh>
      <mesh position={[0, 1.62, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[0.85, 0.42, 4]} />
        <Flat color={palette.wood} />
      </mesh>
      <mesh position={[0, 1.2, 0]}>
        <cylinderGeometry args={[0.015, 0.015, 0.44, 4]} />
        <Flat color={palette.plank} />
      </mesh>
      <mesh position={[0, 0.92, 0]}>
        <cylinderGeometry args={[0.12, 0.1, 0.18, 7]} />
        <Flat color={palette.woodDark} />
      </mesh>
    </group>
  )
}

/** The yard in front of the keep: a cobbled cell with the well and the ten goods piles. */
function Yard({ sim }: { sim: Sim }) {
  const c = cellCentre(YARD_COL, YARD_ROW)
  return (
    <group>
      <mesh position={[c.x, 0.06, c.z]} receiveShadow>
        <boxGeometry args={[CELL - 0.1, 0.12, CELL - 0.1]} />
        <Flat color={palette.cobble} />
      </mesh>
      <Well />
      {GOODS.map((g) => (
        <Pile key={g} sim={sim} good={g} />
      ))}
    </group>
  )
}

// ---------------------------------------------------------------------------- cells

/**
 * The grid: an invisible plane that turns a tap into a cell (or a walk when no piece
 * is chosen), a pulsing white ring on every cell the chosen piece fits, and the ghost.
 */
function Cells({ sim, game }: { sim: Sim; game: Game }) {
  const rings = useRef<InstancedMesh>(null!)
  useFrame(() => {
    const kind = chosenPiece(sim)
    const pulse = 1 + 0.06 * Math.sin(sim.time * 5)
    for (let row = 0; row < GRID; row++) {
      for (let col = 0; col < GRID; col++) {
        const on = kind !== null && canPlace(sim, kind, col, row)
        const c = cellCentre(col, row)
        scratch.position.set(c.x, 0.03, c.z)
        scratch.rotation.set(-Math.PI / 2, 0, 0)
        scratch.scale.setScalar(on ? pulse : 1e-4)
        scratch.updateMatrix()
        rings.current.setMatrixAt(cellIndex(col, row), scratch.matrix)
      }
    }
    rings.current.instanceMatrix.needsUpdate = true
    setOpacity(rings.current, 0.3 + 0.12 * Math.sin(sim.time * 5))
  })
  return (
    <>
      <mesh
        position={[0, 0.01, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={(e) => {
          e.stopPropagation()
          const c = cellAt(e.point.x, e.point.z)
          if (!c || !game.tapCell(c.col, c.row)) game.tapGround(e.point.x, e.point.z)
        }}
      >
        <planeGeometry args={[GRID * CELL, GRID * CELL]} />
        <meshBasicMaterial visible={false} />
      </mesh>
      <instancedMesh ref={rings} args={[undefined, undefined, GRID * GRID]} frustumCulled={false}>
        <ringGeometry args={[1.35, 1.7, 24]} />
        <Glow color={palette.cellRing} opacity={0.4} />
      </instancedMesh>
      <Ghost sim={sim} />
    </>
  )
}

/** A see-through copy of the chosen piece on the cell it would land on, hopping over when that cell changes. */
function Ghost({ sim }: { sim: Sim }) {
  const kind = useSimValue(() => chosenPiece(sim))
  const dye = useSimValue(() => sim.dye)
  const root = useRef<Group>(null!)
  const fake = useMemo<Piece>(
    () => ({ id: -1, kind: kind ?? 'wall', col: 0, row: 0, colour: kind === 'banner' ? dye : UNPAINTED, storeys: 1, state: 'ok', builtAt: -10, stateAt: -10, repair: 0, dousedAt: -1 }),
    [kind, dye],
  )
  const hop = useRef({ col: -1, row: -1, at: -10 })
  // The ghost casts no shadow: it is not there yet.
  useLayoutEffect(() => {
    root.current.traverse((o) => {
      o.castShadow = false
    })
  }, [fake])
  useFrame(() => {
    const g = root.current
    const cell = kind === null ? null : ghostCell(sim)
    if (cell === null) {
      show(g, false)
      return
    }
    if (cell.col !== hop.current.col || cell.row !== hop.current.row) hop.current = { col: cell.col, row: cell.row, at: sim.time }
    fake.col = cell.col
    fake.row = cell.row
    const c = pieceCentre(fake)
    const u = Math.min(1, (sim.time - hop.current.at) / 0.3)
    g.position.set(c.x, 0.6 * Math.sin(u * Math.PI), c.z)
    show(g, true)
  })
  return (
    <group ref={root}>
      {kind !== null && (
        <GhostContext value={true}>
          <PieceModel sim={sim} piece={fake} roof={roofHex(fake)} />
        </GhostContext>
      )}
    </group>
  )
}

/** A cobble tile under every cell a piece stands on, popping in with the piece. */
function CellTiles({ sim }: { sim: Sim }) {
  const mesh = useRef<InstancedMesh>(null!)
  useFrame(() => {
    for (let i = 0; i < GRID * GRID; i++) {
      const id = sim.cells[i]!
      const s = id > 0 ? Math.max(1e-4, pop(sim.time - pieceById(sim, id).builtAt)) : 1e-4
      const c = cellCentre(i % GRID, Math.floor(i / GRID))
      scratch.position.set(c.x, 0.06, c.z)
      scratch.rotation.set(0, 0, 0)
      scratch.scale.set(s, 1, s)
      scratch.updateMatrix()
      mesh.current.setMatrixAt(i, scratch.matrix)
    }
    mesh.current.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, GRID * GRID]} frustumCulled={false} receiveShadow>
      <boxGeometry args={[CELL - 0.1, 0.12, CELL - 0.1]} />
      <Flat color={palette.cobble} />
    </instancedMesh>
  )
}

const FLOWER_SLOTS = 6
const FLOWER_CAPACITY = GRID * GRID * FLOWER_SLOTS

/** Six tiny flowers in the dye colours around the edge of every placed piece, a second after it lands. */
function PieceFlowers({ sim }: { sim: Sim }) {
  const mesh = useRef<InstancedMesh>(null!)
  useLayoutEffect(() => {
    const colours = COLOURS.map((c) => new Color(dyeHex(c)))
    for (let i = 0; i < FLOWER_CAPACITY; i++) mesh.current.setColorAt(i, colours[i % 4]!)
    mesh.current.instanceColor!.needsUpdate = true
  }, [])
  useFrame(() => {
    let i = 0
    for (const p of sim.pieces) {
      const c = pieceCentre(p)
      const half = (SIZE[p.kind] * CELL) / 2 - 0.3
      const grow = Math.min(1, Math.max(0, (sim.time - p.builtAt - 1) / 0.4))
      for (let k = 0; k < FLOWER_SLOTS; k++) {
        const a = (k / FLOWER_SLOTS) * Math.PI * 2 + p.id * 0.7
        // Around the tile's edge: a circle pushed out and clamped to the square.
        const x = Math.max(-half, Math.min(half, Math.cos(a) * half * 1.5))
        const z = Math.max(-half, Math.min(half, Math.sin(a) * half * 1.5))
        const s = grow * (0.13 + 0.03 * Math.sin(sim.time * 2 + k + p.id))
        scratch.position.set(c.x + x, 0.12 + s, c.z + z)
        scratch.rotation.set(0, 0, 0)
        scratch.scale.setScalar(Math.max(1e-4, s))
        scratch.updateMatrix()
        mesh.current.setMatrixAt(i++, scratch.matrix)
      }
    }
    mesh.current.count = i
    mesh.current.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, FLOWER_CAPACITY]} frustumCulled={false}>
      <sphereGeometry args={[1, 6, 5]} />
      <Tinted />
    </instancedMesh>
  )
}

/** A lawn tint under the whole castle once three pieces stand. */
function Lawn({ sim }: { sim: Sim }) {
  const disc = useRef<Mesh>(null!)
  useFrame(() => show(disc.current, sim.pieces.length >= 3))
  return (
    <mesh ref={disc} position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <circleGeometry args={[15, 40]} />
      <Flat color={palette.lawn} />
    </mesh>
  )
}

// --------------------------------------------------------------------------- pieces

const RING_SEGMENTS = 16
const ARC = Array.from({ length: RING_SEGMENTS }, (_, i) => Math.PI / 2 + (i * Math.PI * 2) / RING_SEGMENTS)
/** Where the loose stones lie around a broken piece, as fractions of its half width. */
const STONES: [number, number][] = [
  [0.7, 0.6],
  [-0.6, 0.75],
  [0.8, -0.5],
]

/**
 * One placed piece: its model at its cell, the placement pop, the cartoon fire and
 * smoke while it burns, the steam when doused, the loose stones and the bobbing hammer
 * sign with its repair ring while it is broken, and the gold ring when the brush is out.
 */
function PieceItem({ sim, game, piece }: { sim: Sim; game: Game; piece: Piece }) {
  const root = useRef<Group>(null!)
  const fire = useRef<Group>(null!)
  const flames = useRef<Mesh[]>([])
  const smoke = useRef<Mesh[]>([])
  const steam = useRef<Mesh[]>([])
  const broken = useRef<Group>(null!)
  const sign = useRef<Group>(null!)
  const arc = useRef<Mesh[]>([])
  const paint = useRef<Mesh>(null!)
  const roof = useSimValue(() => roofHex(piece))
  const c = pieceCentre(piece)
  const half = (SIZE[piece.kind] * CELL) / 2
  useFrame(() => {
    const t = sim.time
    root.current.scale.setScalar(Math.max(1e-4, pop(t - piece.builtAt)))
    const top = pieceTop(piece)
    const burning = piece.state === 'burning'
    show(fire.current, burning)
    if (burning) {
      fire.current.position.y = top
      flames.current.forEach((f, i) => {
        f.scale.set(1 + 0.2 * Math.sin(t * 63 + i * 2), 1 + 0.25 * Math.sin(t * 63 + i), 1 + 0.2 * Math.cos(t * 63 + i * 3))
        f.rotation.y = t * 3 + i
      })
      smoke.current.forEach((m, i) => {
        const p = (t * 0.6 + i / 4) % 1
        m.position.set(0.5 * Math.sin(t + i * 2), 1.4 + p * 2.6, 0.5 * Math.cos(t * 0.8 + i))
        m.scale.setScalar(0.25 + p * 0.6)
        setOpacity(m, 0.7 * (1 - p))
      })
    }
    const steamAge = t - piece.dousedAt
    const steaming = piece.dousedAt >= 0 && steamAge < 0.8
    steam.current.forEach((m, i) => {
      show(m, steaming)
      if (!steaming) return
      const u = steamAge / 0.8
      m.position.set((i - 1) * 0.5, top + 0.3 + u * 1.5, 0.2 * i)
      m.scale.setScalar(0.3 + u * 0.9)
      setOpacity(m, 0.8 * (1 - u))
    })
    const isBroken = piece.state === 'broken'
    show(broken.current, isBroken)
    if (isBroken) {
      sign.current.position.y = top + 2 + 0.25 * Math.sin(t * 3)
      sign.current.rotation.y = 0.4 * Math.sin(t * 2)
      const lit = Math.floor(piece.repair * RING_SEGMENTS)
      arc.current.forEach((m, i) => show(m, i < lit))
    }
    const paintable = sim.selected === 'paint' && PAINTABLE.includes(piece.kind)
    show(paint.current, paintable)
    if (paintable) paint.current.scale.setScalar(1 + 0.06 * Math.sin(t * 5))
  })
  return (
    <group
      ref={root}
      position={[c.x, 0, c.z]}
      onPointerDown={(e) => {
        e.stopPropagation()
        game.tapPiece(piece.id)
      }}
    >
      <PieceModel sim={sim} piece={piece} roof={roof} />
      <mesh ref={paint} position={[0, 0.14, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[half - 0.5, half - 0.2, 24]} />
        <Glow color={palette.gold} opacity={0.6} />
      </mesh>
      <group ref={fire}>
        {palette.fire.map((hex, i) => (
          <mesh key={hex} ref={refAt(flames, i)} position={[0, 0.5 + i * 0.55, 0]}>
            <coneGeometry args={[0.9 - i * 0.25, 1.6 - i * 0.35, 6]} />
            <Glow color={hex} opacity={0.95} />
          </mesh>
        ))}
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} ref={refAt(smoke, i)}>
            <sphereGeometry args={[0.5, 7, 6]} />
            <Glow color={palette.smoke} opacity={0.7} />
          </mesh>
        ))}
      </group>
      {[0, 1, 2].map((i) => (
        <mesh key={i} ref={refAt(steam, i)}>
          <sphereGeometry args={[0.4, 7, 6]} />
          <Glow color={palette.steam} opacity={0.8} />
        </mesh>
      ))}
      <group ref={broken}>
        {STONES.map((p, i) => (
          <mesh key={i} position={[p[0] * half, 0.3, p[1] * half]} rotation={[0.3 * i, 0.7 * i, 0]} castShadow>
            <dodecahedronGeometry args={[0.32, 0]} />
            <Flat color={palette.stoneShade} />
          </mesh>
        ))}
        <group ref={sign}>
          <group rotation={[0, 0, 0.5]}>
            <mesh position={[0, 0.45, 0]}>
              <boxGeometry args={[0.9, 0.45, 0.45]} />
              <Shiny color={palette.hammerSign} />
            </mesh>
            <mesh position={[0, -0.2, 0]}>
              <boxGeometry args={[0.18, 1.2, 0.18]} />
              <Shiny color={palette.hammerSign} />
            </mesh>
          </group>
          {ARC.map((a, i) => (
            <mesh key={i} ref={refAt(arc, i)} rotation={[-0.66, 0, 0]}>
              <ringGeometry args={[1.05, 1.2, 4, 1, a, (Math.PI * 2) / RING_SEGMENTS]} />
              <Glow color={palette.gold} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  )
}

/** The model for a piece, picked by kind; the same component draws the ghost. */
function PieceModel({ sim, piece, roof }: { sim: Sim; piece: Piece; roof: string }) {
  switch (piece.kind) {
    case 'wall':
      return <WallModel sim={sim} piece={piece} />
    case 'tower':
      return <TowerModel sim={sim} piece={piece} roof={roof} />
    case 'gate':
      return <GateModel piece={piece} roof={roof} />
    case 'room':
      return <RoomModel piece={piece} roof={roof} />
    case 'hall':
      return <HallModel sim={sim} piece={piece} roof={roof} />
    case 'garden':
      return <GardenModel sim={sim} piece={piece} />
    case 'banner':
      return <BannerModel sim={sim} piece={piece} roof={roof} />
    case 'belltower':
      return <BelltowerModel sim={sim} piece={piece} roof={roof} />
    default:
      return <WorkshopModel sim={sim} piece={piece} kind={piece.kind} />
  }
}

// ------------------------------------------------------------------------- buildings

const WALL_T = 1.2
const WALL_BODY = 1.7
const WALL_CAP = 0.5
/** The four ways a wall can run: +X, -X, +Z, -Z, as (dcol, drow); i ^ 1 is the opposite way. */
const DIRS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]
/** The yaw that turns a segment built along +X to run each way. */
const YAW = [0, Math.PI, -Math.PI / 2, Math.PI / 2]
const JOINS: readonly PieceKind[] = ['wall', 'tower', 'gate']

/**
 * A wall joins up: a segment runs from the centre to every side with a wall, tower or
 * gate on it. Alone, or on a corner, it grows a turret in the middle; with one
 * neighbour it runs straight across and grows a turret on its free end.
 */
function WallModel({ sim, piece }: { sim: Sim; piece: Piece }) {
  const segBody = useRef<Group[]>([])
  const segCap = useRef<Group[]>([])
  const centre = useRef<Group>(null!)
  const ends = useRef<Group[]>([])
  useFrame(() => {
    const joined = DIRS.map(([dc, dr]) => {
      const col = piece.col + dc
      const row = piece.row + dr
      if (!inGrid(col, row)) return false
      const id = sim.cells[cellIndex(col, row)]!
      return id > 0 && JOINS.includes(pieceById(sim, id).kind)
    })
    const n = joined.filter(Boolean).length
    const straight = n === 2 && ((joined[0] && joined[1]) || (joined[2] && joined[3]))
    const lone = n === 1
    for (let i = 0; i < 4; i++) {
      const run = joined[i]! || (lone && joined[i ^ 1]!)
      show(segBody.current[i]!, run)
      show(segCap.current[i]!, run)
      show(ends.current[i]!, lone && joined[i ^ 1]!)
    }
    show(centre.current, n === 0 || (n === 2 && !straight))
  })
  const segment = (i: number, part: 'body' | 'cap') => (
    <group key={i} rotation={[0, YAW[i]!, 0]} ref={refAt(part === 'body' ? segBody : segCap, i)}>
      {part === 'body' ? (
        <mesh position={[1.05, WALL_BODY / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[2.1, WALL_BODY, WALL_T]} />
          <Mat color={palette.stone} />
        </mesh>
      ) : (
        <>
          <mesh position={[1.05, WALL_CAP / 2, 0]} castShadow>
            <boxGeometry args={[2.1, WALL_CAP, WALL_T + 0.1]} />
            <Mat color={palette.stoneShade} />
          </mesh>
          {[0.55, 1.45].map((x) =>
            [-0.45, 0.45].map((z) => (
              <mesh key={`${x}${z}`} position={[x, WALL_CAP + 0.18, z]} castShadow>
                <boxGeometry args={[0.4, 0.36, 0.28]} />
                <Mat color={palette.stone} />
              </mesh>
            )),
          )}
        </>
      )}
    </group>
  )
  return (
    <Parts
      piece={piece}
      topY={() => WALL_BODY}
      body={
        <>
          <mesh position={[0, WALL_BODY / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[WALL_T, WALL_BODY, WALL_T]} />
            <Mat color={palette.stone} />
          </mesh>
          {DIRS.map((_, i) => segment(i, 'body'))}
          <group ref={centre}>
            <Turret position={[0, 0, 0]} />
          </group>
          {DIRS.map(([dc, dr], i) => (
            <group key={i} ref={refAt(ends, i)}>
              <Turret position={[dc * 2, 0, dr * 2]} />
            </group>
          ))}
        </>
      }
      top={
        <>
          <mesh position={[0, WALL_CAP / 2, 0]} castShadow>
            <boxGeometry args={[WALL_T + 0.1, WALL_CAP, WALL_T + 0.1]} />
            <Mat color={palette.stoneShade} />
          </mesh>
          {DIRS.map((_, i) => segment(i, 'cap'))}
        </>
      }
    />
  )
}

const TOWER_BATTLEMENTS = Array.from({ length: 10 }, (_, i) => (i / 10) * Math.PI * 2)

/** A round tower that grows a storey at a time, with a castle-blue (or painted) cone roof, a finial and a flag. */
function TowerModel({ sim, piece, roof }: { sim: Sim; piece: Piece; roof: string }) {
  const body = useRef<Mesh>(null!)
  const h = useRef<Eased>({ v: towerHeight(piece), t: sim.time })
  useFrame(() => {
    const y = settle(h.current, towerHeight(piece), sim.time, 0.8)
    body.current.scale.y = y
    body.current.position.y = y / 2
  })
  return (
    <Parts
      piece={piece}
      topY={() => h.current.v}
      body={
        <>
          <mesh ref={body} castShadow receiveShadow>
            <cylinderGeometry args={[1.6, 1.6, 1, 12]} />
            <Mat color={palette.stone} />
          </mesh>
          <mesh position={[0, 0.3, 0]}>
            <cylinderGeometry args={[1.75, 1.9, 0.6, 12]} />
            <Mat color={palette.stoneBase} />
          </mesh>
          <mesh position={[0, 0.75, 1.55]}>
            <boxGeometry args={[0.7, 1.5, 0.12]} />
            <Mat color={palette.door} />
          </mesh>
          {[70, 180, 290].map((deg) => (
            <Window key={deg} position={[Math.sin(deg * DEG) * 1.62, 1.9, Math.cos(deg * DEG) * 1.62]} rotation={[0, deg * DEG, 0]} w={0.36} h={0.55} arched />
          ))}
        </>
      }
      top={
        <>
          {[0, 120, 240].map((deg) => (
            <Window key={deg} position={[Math.sin(deg * DEG) * 1.62, -1.0, Math.cos(deg * DEG) * 1.62]} rotation={[0, deg * DEG, 0]} w={0.36} h={0.55} arched />
          ))}
          <mesh position={[0, 0.15, 0]}>
            <cylinderGeometry args={[1.85, 1.6, 0.3, 12]} />
            <Mat color={palette.stoneShade} />
          </mesh>
          {TOWER_BATTLEMENTS.map((a) => (
            <mesh key={a} position={[Math.sin(a) * 1.65, 0.5, Math.cos(a) * 1.65]} rotation={[0, a, 0]} castShadow>
              <boxGeometry args={[0.5, 0.45, 0.35]} />
              <Mat color={palette.stone} />
            </mesh>
          ))}
          <mesh position={[0, 1.2, 0]} castShadow>
            <coneGeometry args={[1.75, 1.8, 12]} />
            <Mat color={roof} />
          </mesh>
          <mesh position={[0, 2.15, 0]}>
            <sphereGeometry args={[0.16, 8, 6]} />
            <Mat color={palette.gold} finish="shiny" />
          </mesh>
          <group position={[0, 2.2, 0]}>
            <Flag sim={sim} color={piece.colour === UNPAINTED ? palette.gold : roof} size={0.8} />
          </group>
        </>
      }
    />
  )
}

/** The gate: two square towers with painted caps, a stone arch, a wooden double door and a drawbridge lowered in front. */
function GateModel({ piece, roof }: { piece: Piece; roof: string }) {
  return (
    <Parts
      piece={piece}
      topY={() => 2.9}
      body={
        <>
          {[-1.3, 1.3].map((x) => (
            <mesh key={x} position={[x, 1.45, 0]} castShadow receiveShadow>
              <boxGeometry args={[1.3, 2.9, 1.5]} />
              <Mat color={palette.stone} />
            </mesh>
          ))}
          <mesh position={[0, 2.35, 0]} castShadow>
            <boxGeometry args={[1.4, 1.1, 1.3]} />
            <Mat color={palette.stone} />
          </mesh>
          <mesh position={[0, 1.85, 0.66]} rotation={[-Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.7, 0.7, 0.06, 10, 1, false, -Math.PI / 2, Math.PI]} />
            <Mat color={palette.stoneShade} />
          </mesh>
          {[-0.33, 0.33].map((x) => (
            <mesh key={x} position={[x, 0.95, 0.5]}>
              <boxGeometry args={[0.62, 1.9, 0.1]} />
              <Mat color={palette.door} />
            </mesh>
          ))}
          <mesh position={[0, 0.06, 1.55]} receiveShadow>
            <boxGeometry args={[1.5, 0.12, 1.7]} />
            <Mat color={palette.plank} />
          </mesh>
          {[-0.62, 0.62].map((x) => (
            <mesh key={x} position={[x, 1.2, 1.6]} rotation={[0.5, 0, 0]}>
              <cylinderGeometry args={[0.03, 0.03, 2.4, 4]} />
              <Mat color={palette.iron} finish="iron" />
            </mesh>
          ))}
        </>
      }
      top={
        <>
          {[-1.3, 1.3].map((x) => (
            <group key={x} position={[x, 0, 0]}>
              <mesh position={[0, 0.5, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
                <coneGeometry args={[1.1, 1.0, 4]} />
                <Mat color={roof} />
              </mesh>
              <mesh position={[0, 1.05, 0]}>
                <sphereGeometry args={[0.12, 8, 6]} />
                <Mat color={palette.gold} finish="shiny" />
              </mesh>
            </group>
          ))}
          {[-0.45, 0.45].map((x) => (
            <mesh key={x} position={[x, 0.2, 0]}>
              <boxGeometry args={[0.4, 0.4, 1.3]} />
              <Mat color={palette.stone} />
            </mesh>
          ))}
        </>
      }
    />
  )
}

/** A room: a cream house with a ridge roof (castle blue, paintable), two windows, a door and a chimney. */
function RoomModel({ piece, roof }: { piece: Piece; roof: string }) {
  return (
    <Parts
      piece={piece}
      topY={() => 2.2}
      body={
        <>
          <mesh position={[0, 1.1, 0]} castShadow receiveShadow>
            <boxGeometry args={[3.0, 2.2, 2.8]} />
            <Mat color={palette.stone} />
          </mesh>
          <mesh position={[0, 0.6, 1.41]}>
            <boxGeometry args={[0.7, 1.2, 0.1]} />
            <Mat color={palette.door} />
          </mesh>
          <Window position={[-0.95, 1.3, 1.42]} w={0.55} h={0.6} />
          <Window position={[0.95, 1.3, 1.42]} w={0.55} h={0.6} />
        </>
      }
      top={
        <>
          <mesh geometry={ROOM_ROOF} castShadow>
            <Mat color={roof} />
          </mesh>
          <mesh position={[0.9, 0.85, -0.5]} castShadow>
            <boxGeometry args={[0.4, 0.9, 0.4]} />
            <Mat color={palette.stoneShade} />
          </mesh>
        </>
      }
    />
  )
}

const HALL_Z = -1.2
const HALL_FRONT = HALL_Z + 2.2
/** The dance floor in front of the hall: six by two squares cycling through the dye colours. */
const CHEQUER = Array.from({ length: 12 }, (_, i) => ({ x: ((i % 6) - 2.5) * 0.9, z: Math.floor(i / 6) * 0.9, colour: ((i % 6) + Math.floor(i / 6)) % 4 }))
/** Nine pennants sagging between the roof corners of the hall, relative to the roof base. */
const HALL_BUNTING = Array.from({ length: 9 }, (_, i) => {
  const u = (i + 0.5) / 9
  return { x: -3.3 + 6.6 * u, y: 0.2 - 0.9 * 4 * u * (1 - u), colour: i % 4 }
})

/** The dance hall, the one 2 by 2 piece: a long cream hall, a tall ridge roof, arched windows, a swinging chandelier and a chequered floor. */
function HallModel({ sim, piece, roof }: { sim: Sim; piece: Piece; roof: string }) {
  const chandelier = useRef<Group>(null!)
  useFrame(() => {
    chandelier.current.rotation.z = 0.12 * Math.sin(sim.time * 1.7)
    chandelier.current.rotation.x = 0.08 * Math.sin(sim.time * 1.3 + 1)
  })
  return (
    <Parts
      piece={piece}
      topY={() => 3.0}
      body={
        <>
          <mesh position={[0, 1.5, HALL_Z]} castShadow receiveShadow>
            <boxGeometry args={[6.6, 3.0, 4.4]} />
            <Mat color={palette.stone} />
          </mesh>
          {[-2.4, -0.8, 0.8, 2.4].map((x) => (
            <Window key={x} position={[x, 1.6, HALL_FRONT + 0.02]} w={0.7} h={1.1} arched />
          ))}
          <mesh position={[0, 0.8, HALL_FRONT + 0.02]}>
            <boxGeometry args={[1.2, 1.6, 0.1]} />
            <Mat color={palette.door} />
          </mesh>
          <group position={[0, 3.3, HALL_FRONT + 0.6]}>
            <group ref={chandelier}>
              <mesh position={[0, -0.3, 0]}>
                <cylinderGeometry args={[0.02, 0.02, 0.6, 4]} />
                <Mat color={palette.gold} finish="shiny" />
              </mesh>
              <mesh position={[0, -0.65, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.4, 0.05, 6, 10]} />
                <Mat color={palette.gold} finish="shiny" />
              </mesh>
              {[0, 1, 2, 3, 4].map((i) => (
                <mesh key={i} position={[Math.cos(i * 1.257) * 0.4, -0.5, Math.sin(i * 1.257) * 0.4]}>
                  <sphereGeometry args={[0.07, 6, 5]} />
                  <Mat color={palette.window} finish="glow" />
                </mesh>
              ))}
            </group>
          </group>
          {CHEQUER.map((q, i) => (
            <mesh key={i} position={[q.x, 0.16, HALL_FRONT + 0.7 + q.z]} receiveShadow>
              <boxGeometry args={[0.85, 0.08, 0.85]} />
              <Mat color={dyeHex(q.colour)} />
            </mesh>
          ))}
        </>
      }
      top={
        <>
          <mesh geometry={HALL_ROOF} position={[0, 0, HALL_Z]} castShadow>
            <Mat color={roof} />
          </mesh>
          {[-3.4, 3.4].map((x) => (
            <mesh key={x} position={[x, 1.6, HALL_Z]}>
              <sphereGeometry args={[0.14, 8, 6]} />
              <Mat color={palette.gold} finish="shiny" />
            </mesh>
          ))}
          {HALL_BUNTING.map((b, i) => (
            <Pennant key={i} position={[b.x, b.y, HALL_Z + 2.75]} color={dyeHex(b.colour)} />
          ))}
        </>
      }
    />
  )
}

/** A garden: a stone basin with glowing water, a fountain of six drops arcing out, and a flower bed in each dye colour. */
function GardenModel({ sim, piece }: { sim: Sim; piece: Piece }) {
  const drops = useRef<Mesh[]>([])
  useFrame(() => {
    drops.current.forEach((m, i) => {
      const p = (sim.time * 0.9 + i / 6) % 1
      const a = i * (Math.PI / 3) + sim.time * 0.5
      const r = 0.15 + p * 0.95
      m.position.set(Math.cos(a) * r, 0.65 + 1.6 * Math.sin(p * Math.PI), Math.sin(a) * r)
      m.scale.setScalar(0.14 + 0.06 * (1 - p))
    })
  })
  return (
    <Parts
      piece={piece}
      topY={() => 0.6}
      body={
        <>
          <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[1.5, 1.6, 0.6, 12]} />
            <Mat color={palette.stone} />
          </mesh>
          <mesh position={[0, 0.62, 0]}>
            <cylinderGeometry args={[1.3, 1.3, 0.04, 12]} />
            <Mat color={palette.fountain} finish="glow" />
          </mesh>
          <mesh position={[0, 0.9, 0]}>
            <cylinderGeometry args={[0.18, 0.25, 0.7, 8]} />
            <Mat color={palette.stoneShade} />
          </mesh>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <mesh key={i} ref={refAt(drops, i)}>
              <sphereGeometry args={[1, 6, 5]} />
              <Mat color={palette.water2} finish="glow" />
            </mesh>
          ))}
          {COLOURS.map((c) => {
            const a = c * (Math.PI / 2) + Math.PI / 4
            return (
              <group key={c} position={[Math.cos(a) * 2.25, 0.12, Math.sin(a) * 2.25]}>
                <mesh position={[0, 0.06, 0]}>
                  <cylinderGeometry args={[0.38, 0.42, 0.12, 8]} />
                  <Mat color={palette.dirt} />
                </mesh>
                {[0, 1, 2].map((i) => (
                  <mesh key={i} position={[Math.cos(i * 2.1) * 0.18, 0.26, Math.sin(i * 2.1) * 0.18]}>
                    <sphereGeometry args={[0.13, 7, 6]} />
                    <Mat color={dyeHex(c)} />
                  </mesh>
                ))}
              </group>
            )
          })}
        </>
      }
      top={null}
    />
  )
}

/** A banner: a gold pole with a cloth in the dye colour it was made in, flapping in the wind. Blown away, the cloth is gone until fetched. */
function BannerModel({ sim, piece, roof }: { sim: Sim; piece: Piece; roof: string }) {
  const cloth = useRef<Group>(null!)
  useFrame(() => {
    const w = windStrength(sim)
    cloth.current.rotation.y = Math.sin(sim.time * (3 + 6 * w) + piece.id) * (0.25 + 0.6 * w)
  })
  return (
    <Parts
      piece={piece}
      topY={() => 3.5}
      lay={false}
      body={
        <>
          <mesh position={[0, 0.1, 0]}>
            <cylinderGeometry args={[0.35, 0.45, 0.2, 8]} />
            <Mat color={palette.stoneShade} />
          </mesh>
          <mesh position={[0, 1.75, 0]} castShadow>
            <cylinderGeometry args={[0.07, 0.07, 3.5, 6]} />
            <Mat color={palette.gold} finish="shiny" />
          </mesh>
          <mesh position={[0, 3.62, 0]}>
            <sphereGeometry args={[0.16, 8, 6]} />
            <Mat color={palette.gold} finish="shiny" />
          </mesh>
        </>
      }
      top={
        <group ref={cloth} position={[0, -0.9, 0]}>
          <mesh position={[0.62, 0, 0]} castShadow>
            <boxGeometry args={[1.2, 1.6, 0.06]} />
            <Mat color={roof} />
          </mesh>
        </group>
      }
    />
  )
}

const BELFRY_POSTS: [number, number][] = [
  [-0.6, -0.6],
  [0.6, -0.6],
  [-0.6, 0.6],
  [0.6, 0.6],
]

/** The bell tower: a slim stone tower, a bell in an open belfry, and an iron rod with a ball that glows when lightning rings it. */
function BelltowerModel({ sim, piece, roof }: { sim: Sim; piece: Piece; roof: string }) {
  const glow = useRef<Mesh>(null!)
  useFrame(() => {
    const age = sim.time - sim.bongAt
    const on = age >= 0 && age < 1.5
    glow.current.scale.setScalar(on ? 0.3 + 1.2 * Math.sin((age / 1.5) * Math.PI) : 1e-4)
  })
  return (
    <Parts
      piece={piece}
      topY={() => 3.6}
      body={
        <>
          <mesh position={[0, 1.8, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.5, 3.6, 1.5]} />
            <Mat color={palette.stone} />
          </mesh>
          <mesh position={[0, 0.25, 0]}>
            <boxGeometry args={[1.9, 0.5, 1.9]} />
            <Mat color={palette.stoneBase} />
          </mesh>
          <Window position={[0, 2.2, 0.76]} w={0.4} h={0.7} arched />
          <mesh position={[0, 0.55, 0.76]}>
            <boxGeometry args={[0.5, 1.1, 0.08]} />
            <Mat color={palette.door} />
          </mesh>
        </>
      }
      top={
        <>
          {BELFRY_POSTS.map(([x, z], i) => (
            <mesh key={i} position={[x, 0.5, z]}>
              <boxGeometry args={[0.16, 1.0, 0.16]} />
              <Mat color={palette.stoneShade} />
            </mesh>
          ))}
          <group position={[0, 1.0, 0]}>
            <Bell sim={sim} size={1.1} />
          </group>
          <mesh position={[0, 1.45, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
            <coneGeometry args={[1.25, 0.9, 4]} />
            <Mat color={roof} />
          </mesh>
          <mesh position={[0, 2.45, 0]}>
            <cylinderGeometry args={[0.04, 0.04, 1.2, 5]} />
            <Mat color={palette.iron} finish="iron" />
          </mesh>
          <mesh position={[0, 3.1, 0]}>
            <sphereGeometry args={[0.14, 8, 6]} />
            <Mat color={palette.ironLight} finish="iron" />
          </mesh>
          <mesh ref={glow} position={[0, 3.1, 0]}>
            <sphereGeometry args={[0.3, 8, 6]} />
            <Mat color={palette.gold} finish="glow" opacity={0.7} />
          </mesh>
        </>
      }
    />
  )
}

// ------------------------------------------------------------------------- workshops

const HUT_X = -0.6
const HUT_W = 2.6
const HUT_H = 2.2
const HUT_D = 2.4
/** The extras stand beside the hut, on its east side. */
const EXTRAS_X = 1.3
const CHIMNEY: [number, number, number] = [HUT_X + 0.7, HUT_H + 0.9, -0.5]
/** GoodMesh shapes that stand on the ground sit a little low on the sign. */
const signLift = (g: Good) => (g === 'planks' ? -0.08 : g === 'flowers' ? -0.12 : 0)

/** The picture recipe over a workshop door: the input goods, a gold arrow, the output, no words. Bare board in the ghost. */
function Sign({ sim, kind, position }: { sim: Sim; kind: Workshop; position: [number, number, number] }) {
  const ghost = useContext(GhostContext)
  /** The dyer's sign shows the cloth in the colour the pot is making now. */
  const dye = useSimValue(() => sim.dye)
  const inputs = costEntries(RECIPE[kind].inputs).map(([g]) => g)
  const out = RECIPE[kind].output
  const width = inputs.length * 0.42 + 0.3 + 0.42
  let x = -width / 2
  const slot = (w: number) => {
    const cx = x + w / 2
    x += w
    return cx
  }
  return (
    <group position={position}>
      <mesh castShadow>
        <boxGeometry args={[width + 0.3, 0.7, 0.08]} />
        <Mat color={palette.plank} />
      </mesh>
      {!ghost && (
        <>
          {inputs.map((g) => (
            <group key={g} position={[slot(0.42), signLift(g), 0.12]} scale={0.4}>
              <GoodMesh good={g} />
            </group>
          ))}
          <group position={[slot(0.3), 0, 0.1]} rotation={[0, 0, Math.PI / 2]}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.14, 0.14, 0.03, 3]} />
              <Mat color={palette.gold} finish="shiny" />
            </mesh>
          </group>
          <group position={[slot(0.42), signLift(out), 0.12]} scale={0.4}>
            <GoodMesh good={out} colour={dye} />
          </group>
        </>
      )}
    </group>
  )
}

/** What stands beside each kind of workshop: the tools of its trade. */
function WorkshopExtras({ sim, kind }: { sim: Sim; kind: Workshop }) {
  const puffs = useRef<Mesh[]>([])
  const pots = useRef<Group[]>([])
  const glows = useRef<Mesh[]>([])
  useFrame(() => {
    const t = sim.time
    puffs.current.forEach((m, i) => {
      const p = (t * 0.45 + i / 3) % 1
      m.position.set(CHIMNEY[0] + 0.2 * Math.sin(t + i), CHIMNEY[1] + 0.6 + p * 1.6, CHIMNEY[2] + 0.1 * Math.cos(t + i))
      m.scale.setScalar(0.18 + p * 0.35)
      setOpacity(m, 0.7 * (1 - p))
    })
    pots.current.forEach((g, i) => {
      const on = sim.dye === i
      g.position.y = on ? 0.3 + 0.06 * Math.sin(t * 4) : 0
      glows.current[i]!.scale.setScalar(on ? 1 + 0.15 * Math.sin(t * 6) : 1e-4)
    })
  })
  const log = (position: [number, number, number]) => (
    <mesh key={position.join()} position={position} rotation={[Math.PI / 2, 0, 0]} castShadow>
      <cylinderGeometry args={[0.16, 0.16, 0.8, 7]} />
      <Mat color={palette.trunk} />
    </mesh>
  )
  const block = (position: [number, number, number], turn: number) => (
    <mesh key={position.join()} position={position} rotation={[0, turn, 0]} castShadow>
      <boxGeometry args={[0.55, 0.55, 0.55]} />
      <Mat color={palette.stoneShade} />
    </mesh>
  )
  switch (kind) {
    case 'woodcutter':
      return (
        <group position={[EXTRAS_X, 0, 0]}>
          <mesh position={[0, 0.3, 0.5]} castShadow>
            <cylinderGeometry args={[0.35, 0.4, 0.6, 8]} />
            <Mat color={palette.stump} />
          </mesh>
          <mesh position={[0.1, 0.9, 0.5]} rotation={[0, 0, 0.6]}>
            <boxGeometry args={[0.08, 0.7, 0.08]} />
            <Mat color={palette.woodDark} />
          </mesh>
          <mesh position={[0.32, 1.05, 0.5]} rotation={[0, 0, 0.6]}>
            <boxGeometry args={[0.32, 0.22, 0.1]} />
            <Mat color={palette.iron} finish="iron" />
          </mesh>
          {log([-0.2, 0.16, -0.7])}
          {log([0.2, 0.16, -0.7])}
          {log([0, 0.45, -0.7])}
        </group>
      )
    case 'mason':
      return (
        <group position={[EXTRAS_X, 0, 0]}>
          {block([0, 0.28, 0.45], 0)}
          {block([0, 0.83, 0.45], 0.3)}
          {block([0.05, 0.28, -0.5], 0.5)}
          <mesh position={[0.05, 0.62, -0.5]} rotation={[0, 0, 0.9]}>
            <boxGeometry args={[0.06, 0.5, 0.06]} />
            <Mat color={palette.woodDark} />
          </mesh>
          <mesh position={[-0.12, 0.72, -0.5]} rotation={[0, 0, 0.9]}>
            <boxGeometry args={[0.1, 0.14, 0.04]} />
            <Mat color={palette.iron} finish="iron" />
          </mesh>
        </group>
      )
    case 'smithy':
      return (
        <>
          <group position={[EXTRAS_X, 0, 0]}>
            <mesh position={[0, 0.17, 0.2]} castShadow>
              <boxGeometry args={[0.5, 0.35, 0.45]} />
              <Mat color={palette.stoneBase} />
            </mesh>
            <mesh position={[0, 0.47, 0.2]} castShadow>
              <boxGeometry args={[0.85, 0.25, 0.35]} />
              <Mat color={palette.iron} finish="iron" />
            </mesh>
            <mesh position={[0.5, 0.52, 0.2]} rotation={[0, 0, Math.PI / 2]}>
              <coneGeometry args={[0.12, 0.3, 5]} />
              <Mat color={palette.iron} finish="iron" />
            </mesh>
          </group>
          {[0, 1, 2].map((i) => (
            <mesh key={i} ref={refAt(puffs, i)}>
              <sphereGeometry args={[1, 6, 5]} />
              <Mat color={palette.smoke} finish="glow" opacity={0.7} />
            </mesh>
          ))}
        </>
      )
    case 'weaver':
      return (
        <group position={[EXTRAS_X, 0, 0.2]}>
          {[-0.45, 0.45].map((x) => (
            <mesh key={x} position={[x, 0.7, 0]} castShadow>
              <boxGeometry args={[0.08, 1.4, 0.08]} />
              <Mat color={palette.woodDark} />
            </mesh>
          ))}
          {[0.15, 1.38].map((y) => (
            <mesh key={y} position={[0, y, 0]}>
              <boxGeometry args={[1.0, 0.08, 0.08]} />
              <Mat color={palette.woodDark} />
            </mesh>
          ))}
          {[-0.3, -0.18, -0.06, 0.06, 0.18, 0.3].map((x) => (
            <mesh key={x} position={[x, 0.76, 0]}>
              <boxGeometry args={[0.025, 1.15, 0.025]} />
              <Mat color={palette.woolWhite} />
            </mesh>
          ))}
        </group>
      )
    case 'dyer':
      return (
        <group position={[EXTRAS_X, 0, 0]}>
          {COLOURS.map((c) => (
            <group key={c} ref={refAt(pots, c)}>
              <group position={[(c % 2) * 0.7 - 0.35, 0, Math.floor(c / 2) * 0.8 - 0.4]}>
                <mesh position={[0, 0.25, 0]} castShadow>
                  <cylinderGeometry args={[0.28, 0.22, 0.5, 8]} />
                  <Mat color={dyeHex(c)} />
                </mesh>
                <mesh ref={refAt(glows, c)} position={[0, 0.55, 0]}>
                  <sphereGeometry args={[0.24, 8, 6]} />
                  <Mat color={dyeHex(c)} finish="glow" opacity={0.8} />
                </mesh>
              </group>
            </group>
          ))}
        </group>
      )
  }
}

/** A workshop: one wooden hut for all five, a sign with the recipe in pictures over the door, and the tools of the trade beside it. */
function WorkshopModel({ sim, piece, kind }: { sim: Sim; piece: Piece; kind: Workshop }) {
  const front = HUT_D / 2
  return (
    <Parts
      piece={piece}
      topY={() => HUT_H}
      body={
        <>
          <group position={[HUT_X, 0, 0]}>
            <mesh position={[0, HUT_H / 2, 0]} castShadow receiveShadow>
              <boxGeometry args={[HUT_W, HUT_H, HUT_D]} />
              <Mat color={palette.wood} />
            </mesh>
            {/* The door is on the cell's centre line, where the worker stands. */}
            <mesh position={[-HUT_X, 0.55, front + 0.01]}>
              <boxGeometry args={[0.7, 1.1, 0.08]} />
              <Mat color={palette.door} />
            </mesh>
            <Window position={[-0.7, 1.25, front + 0.02]} w={0.5} h={0.5} />
            <Sign sim={sim} kind={kind} position={[-HUT_X, 1.75, front + 0.06]} />
          </group>
          <WorkshopExtras sim={sim} kind={kind} />
        </>
      }
      top={
        <group position={[HUT_X, 0, 0]}>
          <mesh position={[0, 0.55, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
            <coneGeometry args={[2.15, 1.1, 4]} />
            <Mat color={palette.woodDark} />
          </mesh>
          {kind === 'smithy' && (
            <mesh position={[CHIMNEY[0] - HUT_X, CHIMNEY[1] - HUT_H, CHIMNEY[2]]} castShadow>
              <boxGeometry args={[0.5, 1.0, 0.5]} />
              <Mat color={palette.stoneBase} />
            </mesh>
          )}
        </group>
      }
    />
  )
}

// ----------------------------------------------------------------------- auto-beauty

const LINE_N = 12

/** Once five pieces stand: a line of pennants sagging from the keep's top to the nearest tower. */
function KeepBunting({ sim }: { sim: Sim }) {
  const rope = useRef<InstancedMesh>(null!)
  const flags = useRef<InstancedMesh>(null!)
  useLayoutEffect(() => {
    for (let i = 0; i < LINE_N; i++) flags.current.setColorAt(i, new Color(dyeHex(i)))
    flags.current.instanceColor!.needsUpdate = true
  }, [])
  useFrame(() => {
    let tower: Piece | null = null
    let best = Infinity
    if (sim.pieces.length >= 5) {
      for (const p of sim.pieces) {
        if (p.kind !== 'tower' || p.state !== 'ok') continue
        const c = pieceCentre(p)
        const d = Math.hypot(c.x, c.z)
        if (d < best) {
          best = d
          tower = p
        }
      }
    }
    if (tower === null) {
      rope.current.count = 0
      flags.current.count = 0
      return
    }
    const end = pieceCentre(tower)
    const y0 = keepHeight(sim) + 0.2
    const y1 = pieceTop(tower) + 0.4
    const w = windStrength(sim)
    const yaw = Math.atan2(-end.z, end.x)
    const at = (i: number) => {
      const u = i / (LINE_N - 1)
      const sag = 4 * u * (1 - u)
      return { x: end.x * u + 0.4 * w * sag * Math.sin(sim.time * 3), y: y0 + (y1 - y0) * u - 1.4 * sag, z: end.z * u }
    }
    for (let i = 0; i < LINE_N; i++) {
      const a = at(i)
      if (i < LINE_N - 1) {
        const b = at(i + 1)
        scratch.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
        scratch.lookAt(b.x, b.y, b.z)
        scratch.scale.set(1, 1, Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z))
        scratch.updateMatrix()
        rope.current.setMatrixAt(i, scratch.matrix)
      }
      scratch.position.set(a.x, a.y - 0.2, a.z)
      scratch.rotation.set(Math.PI / 2, yaw, 0.3 * w * Math.sin(sim.time * 4 + i), 'YXZ')
      scratch.scale.setScalar(i === 0 || i === LINE_N - 1 ? 1e-4 : 1)
      scratch.updateMatrix()
      flags.current.setMatrixAt(i, scratch.matrix)
    }
    rope.current.count = LINE_N - 1
    flags.current.count = LINE_N
    rope.current.instanceMatrix.needsUpdate = true
    flags.current.instanceMatrix.needsUpdate = true
  })
  return (
    <>
      <instancedMesh ref={rope} args={[undefined, undefined, LINE_N - 1]} frustumCulled={false}>
        <boxGeometry args={[0.04, 0.04, 1]} />
        <Flat color={palette.goldDark} />
      </instancedMesh>
      <instancedMesh ref={flags} args={[undefined, undefined, LINE_N]} frustumCulled={false}>
        <cylinderGeometry args={[0.22, 0.22, 0.03, 3]} />
        <Tinted />
      </instancedMesh>
    </>
  )
}

const WING_Z = [0.3, -0.3]

/** Once ten pieces stand: two white doves circling the keep high up, on opposite sides. */
function Doves({ sim }: { sim: Sim }) {
  const birds = useRef<Group[]>([])
  const wings = useRef<Group[]>([])
  useFrame(() => {
    const on = sim.pieces.length >= 10
    birds.current.forEach((g, i) => {
      show(g, on)
      if (!on) return
      const a = sim.time * 0.5 + i * Math.PI
      const r = 6.5 + 0.5 * Math.sin(sim.time * 0.7 + i)
      g.position.set(Math.cos(a) * r, 12 + 0.6 * Math.sin(sim.time * 1.3 + i * 2), Math.sin(a) * r)
      g.rotation.y = -(a + Math.PI / 2)
    })
    wings.current.forEach((w, i) => {
      w.rotation.x = (i % 2 === 0 ? -1 : 1) * 0.7 * Math.sin(sim.time * 12 + Math.floor(i / 2))
    })
  })
  return (
    <>
      {[0, 1].map((i) => (
        <group key={i} ref={refAt(birds, i)}>
          <mesh castShadow>
            <sphereGeometry args={[0.22, 8, 6]} />
            <Flat color={palette.woolWhite} />
          </mesh>
          <mesh position={[0.28, 0.08, 0]}>
            <sphereGeometry args={[0.13, 7, 6]} />
            <Flat color={palette.woolWhite} />
          </mesh>
          <mesh position={[0.42, 0.06, 0]} rotation={[0, 0, -Math.PI / 2]}>
            <coneGeometry args={[0.04, 0.12, 4]} />
            <Flat color={palette.gold} />
          </mesh>
          <mesh position={[-0.3, 0, 0]}>
            <boxGeometry args={[0.3, 0.03, 0.22]} />
            <Flat color={palette.woolWhite} />
          </mesh>
          {WING_Z.map((z, k) => (
            <group key={z} ref={refAt(wings, i * 2 + k)}>
              <mesh position={[0, 0, z]}>
                <boxGeometry args={[0.35, 0.03, 0.55]} />
                <Flat color={palette.woolWhite} />
              </mesh>
            </group>
          ))}
        </group>
      ))}
    </>
  )
}

// ----------------------------------------------------------------------------- root

/** The keep, the yard, the grid helpers, every piece, and the extras the castle earns as it grows. */
export function Castle({ sim, game }: { sim: Sim; game: Game }) {
  useFrame(() => {
    windowGlow.color.copy(WINDOW_DAY).lerp(WINDOW_NIGHT, daylight(sim).night)
  })
  return (
    <group>
      <Lawn sim={sim} />
      <Keep sim={sim} game={game} />
      <Yard sim={sim} />
      <Cells sim={sim} game={game} />
      <CellTiles sim={sim} />
      <PieceFlowers sim={sim} />
      <Synced list={() => sim.pieces} render={(p) => <PieceItem key={p.id} sim={sim} game={game} piece={p} />} />
      <KeepBunting sim={sim} />
      <Doves sim={sim} />
    </group>
  )
}
