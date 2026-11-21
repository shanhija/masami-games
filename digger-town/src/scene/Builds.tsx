/**
 * What stands in the town: every building piece by piece (a see-through ghost until the piece is
 * placed, then a bounce), the forms with their rising concrete, and the ponds' ripples and lily
 * pads. The pond's water disc itself is `Ground`'s. Reads the sim every frame, never writes.
 */

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  CircleGeometry,
  Color,
  DoubleSide,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RingGeometry,
  SphereGeometry,
  type BufferGeometry,
} from 'three'

import { LOTS } from '../game/map'
import { mulberry32, TAU } from '../game/math'
import type { Build, Form, Pond, Sim } from '../game/model'
import { pondY } from '../game/terrain'
import { sunOf } from './look'
import { box, cylinder, part, partsOf, SOLID, SOLID_MESH, sphere, useBaked, type Part, type V3 } from './parts'
import { giveColours } from './preload'
import { CLOCK_FACE_Y, CLOCK_HALF, FACE_YAWS, HAND_LENGTH, HAND_PARTS, PIECE_PARTS, SWING_SEAT, SWING_SEAT_X, SWING_TOP, chunk, prism, put, slab, solidGeo, type PieceKind } from './Things'

// ---------------------------------------------------------------------------------------
// Materials.

/** SOLID, and where a part's `hazard` flag is set, a brick or tile pattern in the part's own colour (read from the piece's own coordinates). */
const BRICK = new MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, envMapIntensity: 0.4 })
BRICK.customProgramCacheKey = () => 'digger-town-brick'
BRICK.onBeforeCompile = (shader, renderer) => {
  SOLID.onBeforeCompile(shader, renderer)
  shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vOn;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvOn = objectNormal;')
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vOn;')
    .replace(
      '#include <roughnessmap_fragment>',
      `if (vSurf.w > 0.5) {
        bool slanted = abs(vOn.y) > 0.2 && abs(vOn.y) < 0.95;
        float along = abs(vOn.x) > abs(vOn.z) ? vObj.z : vObj.x;
        float rowH = slanted ? 0.16 : 0.2;
        float brickW = slanted ? 0.4 : 0.55;
        float row = floor(vObj.y / rowH);
        float u = along / brickW + 0.5 * mod(row, 2.0);
        vec2 f = vec2(fract(u), fract(vObj.y / rowH));
        float h = fract(sin(dot(vec2(floor(u), row), vec2(12.9898, 78.233))) * 43758.5453);
        float mortar = (f.x < 0.07 || f.y < 0.1) ? 1.0 : 0.0;
        vec3 base = vColor.rgb * (0.86 + 0.24 * h);
        if (slanted) base *= 0.8 + 0.3 * f.y;
        diffuseColor.rgb = mix(base, vec3(0.82, 0.8, 0.76), mortar * (slanted ? 0.25 : 0.7));
      }
      #include <roughnessmap_fragment>`,
    )
}

const GHOST = new MeshStandardMaterial({ color: '#8cc8ff', emissive: '#3a8cff', emissiveIntensity: 0.55, roughness: 0.5, transparent: true, opacity: 0.35, depthWrite: false })

// ---------------------------------------------------------------------------------------
// House and hall pieces.

/** The three bands of wall and the two sides of roof, per kind: sizes in metres. */
const SHAPE = {
  house: { hx: 3, hz: 2.5, off: 1.6, rise: 1.3, windows: [[-1.8, 1.8], [-1.8, 0, 1.8], [-1.4, 1.4]], sides: [[0], [0], [0]] },
  hall: { hx: 4, hz: 3, off: 2, rise: 1.5, windows: [[-3, 3], [-3, -1.5, 1.5, 3], [-3, -1.5, 1.5, 3]], sides: [[-1.5, 1.5], [-1.5, 1.5], [-1.5, 1.5]] },
} as const
type HouseKind = keyof typeof SHAPE
const BAND = 1.2
const TRIM = '#f4f1ea'

/** A window on the front (face +z) or a side (+x or -x), centred at wall position `along`. The frame goes in `frame`, the glass in `panes`. */
function windowAt(frame: Part[], panes: Part[], face: 'front' | 'right' | 'left', hx: number, hz: number, along: number, y: number, w: number, h: number) {
  const ry = face === 'front' ? 0 : face === 'right' ? Math.PI / 2 : -Math.PI / 2
  const out = face === 'front' ? hz : hx
  const place = (dz: number): V3 => (face === 'front' ? [along, y, out + dz] : [(face === 'right' ? 1 : -1) * (out + dz), y, along])
  const rot: V3 = [0, ry, 0]
  frame.push(part(box(w + 0.16, h + 0.16, 0.08), 'trim', place(0.02), { colour: TRIM, rot }))
  const [sx, , sz] = place(0.1)
  frame.push(part(box(w + 0.3, 0.07, 0.2), 'trim', [sx, y - h / 2 - 0.08, sz], { colour: TRIM, rot }))
  frame.push(part(box(0.05, h, 0.05), 'trim', place(0.07), { colour: TRIM, rot }))
  frame.push(part(box(w, 0.05, 0.05), 'trim', place(0.07), { colour: TRIM, rot }))
  panes.push(part(box(w, h, 0.06), 'trim', place(0.05), { colour: '#cfe8ff', rot }))
}

interface Look {
  solid: BufferGeometry
  panes: BufferGeometry | null
}

function wallLook(kind: HouseKind, band: number, colour: string): Look {
  const { hx, hz, windows, sides } = SHAPE[kind]
  const frame: Part[] = []
  const panes: Part[] = []
  const wall: Part[] = [part(box(hx * 2, BAND, hz * 2), 'hazard', [0, BAND / 2, 0], { colour })]
  frame.push(slab(hx * 2 + 0.14, 0.09, hz * 2 + 0.14, [0, BAND - 0.04, 0], TRIM))
  if (band === 0) frame.push(slab(hx * 2 + 0.2, 0.22, hz * 2 + 0.2, [0, 0.1, 0], '#8f949c'))
  const wh = kind === 'hall' ? 0.78 : 0.6
  windows[band].forEach((x) => {
    if (band === 0 && Math.abs(x) < 1.3) return
    windowAt(frame, panes, 'front', hx, hz, x, kind === 'hall' ? 0.62 : 0.66, 0.62, wh)
  })
  sides[band].forEach((z) => {
    windowAt(frame, panes, 'right', hx, hz, z, 0.62, 0.62, wh)
    windowAt(frame, panes, 'left', hx, hz, z, 0.62, 0.62, wh)
  })
  if (band === 0) {
    const doorW = kind === 'hall' ? 1.7 : 0.85
    frame.push(slab(doorW + 0.22, 1.0, 0.1, [0, 0.55, hz + 0.02], '#6b4a2f', 'plush'))
    frame.push(slab(doorW + 0.5, 0.12, 0.5, [0, 0.07, hz + 0.25], '#b9bcc2'))
    const leaves = kind === 'hall' ? [-1, 1] : [0]
    leaves.forEach((s) => frame.push(chunk(kind === 'hall' ? doorW / 2 - 0.03 : doorW, 0.92, 0.08, 0.03, [s * (doorW / 4), 0.56, hz + 0.07], '#2f9aa8')))
    frame.push(part(sphere(0.05, 8), 'trim', [kind === 'hall' ? -0.15 : 0.28, 0.5, hz + 0.14], { colour: '#e6b422' }))
    if (kind === 'hall') {
      ;[-1.3, 1.3].forEach((x) => frame.push(part(cylinder(0.15, 0.17, 1.2, 12), 'trim', [x, 0.6, hz + 0.5], { colour: TRIM })))
      frame.push(slab(3.6, 0.14, 0.9, [0, 1.15, hz + 0.5], TRIM))
    }
  }
  return { solid: solidGeo(`wall${kind}${band}${colour}`, [...wall, ...frame]), panes: solidGeo(`panes${kind}${band}`, panes) }
}

function roofLook(kind: HouseKind, side: 1 | -1, colour: string, brickColour: string): Look {
  const { hx, hz, off, rise } = SHAPE[kind]
  const run = hx + 0.3
  const drop = rise + 0.1
  const len = Math.hypot(run, drop)
  const angle = Math.atan2(drop, run)
  const mid: V3 = [(side * (hx + 0.3 - off) - side * off) / 2, (rise - 0.1) / 2, 0]
  const nx = Math.sin(angle)
  const ny = Math.cos(angle)
  const parts: Part[] = [
    part(box(len, 0.18, hz * 2 + 0.5), 'hazard', [mid[0] + side * nx * 0.09, mid[1] + ny * 0.09, 0], { colour, rot: [0, 0, -side * angle] }),
    ...[-1, 1].map((e) => part(prism(`gable${kind}${side}`, [[side * (hx - off), 0], [-side * off, 0], [-side * off, rise]], 0.3), 'hazard', [0, 0, e * (hz - 0.15)], { colour: brickColour })),
    part(cylinder(0.1, 0.1, hz * 2 + 0.5, 8), 'trim', [-side * off, rise + 0.04, 0], { colour, rot: [Math.PI / 2, 0, 0] }),
  ]
  if (kind === 'house' && side === 1) {
    parts.push(part(box(0.55, 1.5, 0.55), 'hazard', [0.9, 0.55, -0.9], { colour: '#a8402f' }), slab(0.7, 0.12, 0.7, [0.9, 1.34, -0.9], '#6b6e76'))
  }
  return { solid: solidGeo(`roof${kind}${side}${colour}${brickColour}`, parts), panes: null }
}

// ---------------------------------------------------------------------------------------
// One building piece.

function pieceLook(b: Build, i: number): Look & { pattern: boolean } {
  const spot = b.spots[i]
  const kind: HouseKind = b.kind === 'hall' ? 'hall' : 'house'
  if (spot.wants === 'bricks') return { ...wallLook(kind, b.spots.slice(0, i).filter((s) => s.wants === 'bricks').length, b.colour), pattern: true }
  if (spot.wants === 'planks') return { ...roofLook(kind, spot.x < b.x ? -1 : 1, new Color(b.colour).multiplyScalar(0.5).lerp(new Color('#c0452f'), 0.5).getStyle(), b.colour), pattern: true }
  return { solid: solidGeo(`piece${spot.wants}`, PIECE_PARTS[spot.wants as PieceKind]), panes: null, pattern: false }
}

const handGeo = () => solidGeo('hand', HAND_PARTS)
const seatGeo = () => solidGeo('seat', SWING_SEAT)

/** Clock hands on all four faces, turning with the sim's time. One instanced mesh. */
function ClockHands({ sim }: { sim: Sim }) {
  const ref = useRef<InstancedMesh>(null)
  useFrame(() => {
    const minute = (10 / 60) * TAU + sim.time * 0.5
    const hour = (10 + 10 / 60) * (TAU / 12) + sim.time * 0.5 / 12
    FACE_YAWS.forEach((ry, k) => {
      const nx = Math.sin(ry)
      const nz = Math.cos(ry)
      put(ref.current!, k * 2, nx * (CLOCK_HALF + 0.14), CLOCK_FACE_Y, nz * (CLOCK_HALF + 0.14), ry, 1, HAND_LENGTH.hour, 1, 0, -hour)
      put(ref.current!, k * 2 + 1, nx * (CLOCK_HALF + 0.17), CLOCK_FACE_Y, nz * (CLOCK_HALF + 0.17), ry, 0.8, HAND_LENGTH.minute, 1, 0, -minute)
    })
    ref.current!.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[handGeo(), SOLID, 8]} frustumCulled={false} />
}

/** The swing's two seats, each on its own pivot under the top bar. */
function SwingSeats({ sim }: { sim: Sim }) {
  const pivots = useRef<(Group | null)[]>([])
  useFrame(() => {
    pivots.current.forEach((g, k) => (g!.rotation.x = Math.sin(sim.time * 2.2 + k * 1.1) * 0.5))
  })
  return (
    <>
      {SWING_SEAT_X.map((x, k) => (
        <group key={x} ref={(g) => void (pivots.current[k] = g)} position={[x, SWING_TOP, 0]}>
          <mesh geometry={seatGeo()} material={SOLID_MESH} castShadow />
        </group>
      ))}
    </>
  )
}

function Piece({ sim, b, i, glow }: { sim: Sim; b: Build; i: number; glow: MeshStandardMaterial }) {
  const spot = b.spots[i]
  const look = useMemo(() => pieceLook(b, i), [b, i])
  const group = useRef<Group>(null)
  const solid = useRef<Mesh>(null)
  const panes = useRef<Mesh>(null)
  const extras = useRef<Group>(null)
  const flip = spot.wants === 'beam' && spot.z > b.z ? Math.PI : 0
  useFrame(() => {
    const placed = i < b.placed
    const g = group.current!
    g.visible = placed || b.shown
    const mesh = solid.current!
    mesh.material = placed ? (look.pattern ? BRICK : SOLID_MESH) : GHOST
    mesh.castShadow = placed
    if (panes.current) panes.current.visible = placed
    extras.current!.visible = placed
    const age = i === b.placed - 1 ? sim.time - b.placedAt : 9
    if (age < 1) {
      const u = 1 - Math.exp(-age * 9) * Math.cos(age * 18)
      g.scale.set(1 + (u - 1) * 0.4, Math.max(u, 0.02), 1 + (u - 1) * 0.4)
    } else g.scale.set(1, 1, 1)
  })
  return (
    <group ref={group} position={[spot.x - b.x, spot.y, spot.z - b.z]} rotation={[0, spot.yaw + flip, 0]} visible={false}>
      <mesh ref={solid} geometry={look.solid} material={GHOST} receiveShadow />
      {look.panes && <mesh ref={panes} geometry={look.panes} material={glow} />}
      <group ref={extras}>
        {spot.wants === 'clock' && <ClockHands sim={sim} />}
        {spot.wants === 'swing' && <SwingSeats sim={sim} />}
      </group>
    </group>
  )
}

function Building({ sim, b }: { sim: Sim; b: Build }) {
  const glow = useMemo(() => new MeshStandardMaterial({ color: '#cfe8ff', roughness: 0.1, metalness: 0.1, emissive: '#ffd36a', emissiveIntensity: 0, envMapIntensity: 1.2 }), [])
  useFrame(() => {
    const moved = b.owner !== null && b.placed === b.spots.length && sim.animals.some((a) => a.home === b.id)
    glow.emissiveIntensity = Math.max(sunOf(sim.day).night * 1.1, moved ? 0.75 : 0)
  })
  return (
    <group position={[b.x, 0, b.z]} rotation={[0, b.yaw, 0]}>
      {b.spots.map((_, i) => (
        <Piece key={i} sim={sim} b={b} i={i} glow={glow} />
      ))}
    </group>
  )
}

// ---------------------------------------------------------------------------------------
// Forms.

const FLOOR = -0.3
const FLOOR_TOP = 0.1
const WET = new Color('#5d6066')
const DRY = new Color('#c9cac5')
const SET_SECONDS = 2.5

/** The planks and posts round a lot. */
function formParts(lot: (typeof LOTS)[number]): Part[] {
    const hx = lot.w / 2
    const hz = lot.d / 2
    const boards: Part[] = [
      slab(lot.w + 0.3, 0.55, 0.15, [0, 0, hz + 0.075], '#c98f55', 'plush'),
      slab(lot.w + 0.3, 0.55, 0.15, [0, 0, -hz - 0.075], '#c98f55', 'plush'),
      slab(0.15, 0.55, lot.d, [hx + 0.075, 0, 0], '#c98f55', 'plush'),
      slab(0.15, 0.55, lot.d, [-hx - 0.075, 0, 0], '#c98f55', 'plush'),
    ]
    for (let x = -hx; x <= hx + 0.01; x += lot.w / 4) boards.push(slab(0.14, 0.9, 0.14, [x, 0.1, hz + 0.22], '#8a5a36', 'plush'), slab(0.14, 0.9, 0.14, [x, 0.1, -hz - 0.22], '#8a5a36', 'plush'))
    for (let z = -hz + lot.d / 4; z < hz - 0.01; z += lot.d / 4) boards.push(slab(0.14, 0.9, 0.14, [hx + 0.22, 0.1, z], '#8a5a36', 'plush'), slab(0.14, 0.9, 0.14, [-hx - 0.22, 0.1, z], '#8a5a36', 'plush'))
  return boards
}

function FormView({ f }: { f: Form }) {
  const lot = LOTS[f.lot]
  const frame = useBaked(partsOf(`form${f.lot}`, () => formParts(lot)), '#ffffff').solid
  const material = useMemo(() => new MeshStandardMaterial({ color: WET, roughness: 0.3, envMapIntensity: 0.3 }), [])
  const group = useRef<Group>(null)
  const concrete = useRef<Mesh>(null)
  useFrame(() => {
    group.current!.visible = f.shown
    const c = concrete.current!
    c.visible = f.fill > 0.01
    const h = (FLOOR_TOP - FLOOR) * f.fill + 0.001
    c.scale.set(lot.w - 0.1, h, lot.d - 0.1)
    c.position.y = FLOOR + h / 2
    const dry = f.hard ? 1 : Math.min(1, f.setting / SET_SECONDS)
    material.color.copy(WET).lerp(DRY, dry)
    material.roughness = 0.3 + 0.6 * dry
  })
  return (
    <group ref={group} position={[lot.x, FLOOR + 0.27, lot.z]} visible={false}>
      <mesh geometry={frame} material={SOLID_MESH} castShadow receiveShadow />
      <group position={[0, -FLOOR - 0.27, 0]}>
        <mesh ref={concrete} material={material} receiveShadow>
          <boxGeometry args={[1, 1, 1]} />
        </mesh>
      </group>
    </group>
  )
}

// ---------------------------------------------------------------------------------------
// Ponds.

const PADS = 6
const FLOWERS = 3
// Every pond shares these, made once, so a new game or a visit to the shop makes none.
const PAD_GEO = new CircleGeometry(0.5, 14, 0, 5.5).rotateX(-Math.PI / 2)
const FLOWER_GEO = new SphereGeometry(0.12, 8, 6)
const RING_GEO = new RingGeometry(0.93, 1, 40).rotateX(-Math.PI / 2)
// One pass: three draws a see-through two-sided material twice and re-reads its program each time.
const RING_MATERIAL = new MeshBasicMaterial({ transparent: true, opacity: 0.6, depthWrite: false, side: DoubleSide, forceSinglePass: true })
const PAD_MATERIAL = new MeshStandardMaterial({ color: '#3fa34d', roughness: 0.6, side: DoubleSide })
const FLOWER_MATERIAL = new MeshStandardMaterial({ color: '#ff8ec4', roughness: 0.5 })

function PondView({ sim, p }: { sim: Sim; p: Pond }) {
  const group = useRef<Group>(null)
  const rings = useRef<InstancedMesh | null>(null)
  const pads = useRef<InstancedMesh>(null)
  const flowers = useRef<InstancedMesh>(null)
  const spots = useMemo(() => {
    const rnd = mulberry32(21)
    return Array.from({ length: PADS }, (_, k) => ({ angle: (k / PADS) * TAU + rnd() * 0.8, r: 0.25 + rnd() * 0.3, size: 0.4 + rnd() * 0.25, turn: rnd() * TAU }))
  }, [])
  const colour = useMemo(() => new Color(), [])
  const water = useMemo(() => new Color('#3f9ee0'), [])
  const foam = useMemo(() => new Color('#ffffff'), [])
  useFrame(() => {
    const g = group.current!
    g.visible = p.shown && p.water > 0.4
    if (!g.visible) return
    g.position.y = pondY(sim.terrain, p)
    for (let k = 0; k < 3; k++) {
      const u = (sim.time * 0.25 + k / 3) % 1
      put(rings.current!, k, 0, 0.02, 0, 0, p.r * (0.2 + 0.7 * u))
      rings.current!.setColorAt(k, colour.copy(foam).lerp(water, u))
    }
    rings.current!.instanceMatrix.needsUpdate = true
    rings.current!.instanceColor!.needsUpdate = true
    spots.forEach((s, k) => {
      const bob = Math.sin(sim.time * 1.3 + k) * 0.012
      const x = Math.cos(s.angle) * p.r * s.r
      const z = Math.sin(s.angle) * p.r * s.r
      put(pads.current!, k, x, 0.03 + bob, z, s.turn + Math.sin(sim.time * 0.4 + k) * 0.1, s.size * 2)
      if (k < FLOWERS) put(flowers.current!, k, x, 0.11 + bob, z, 0, 1, 0.8, 1)
    })
    pads.current!.instanceMatrix.needsUpdate = true
    flowers.current!.instanceMatrix.needsUpdate = true
  })
  return (
    <group ref={group} position={[p.x, 0, p.z]} visible={false}>
      <instancedMesh
        ref={(m) => {
          rings.current = m
          giveColours(m)
        }}
        args={[RING_GEO, RING_MATERIAL, 3]} frustumCulled={false} renderOrder={3} />
      <instancedMesh ref={pads} args={[PAD_GEO, PAD_MATERIAL, PADS]} frustumCulled={false} receiveShadow />
      <instancedMesh ref={flowers} args={[FLOWER_GEO, FLOWER_MATERIAL, FLOWERS]} frustumCulled={false} />
    </group>
  )
}

// ---------------------------------------------------------------------------------------

/** Every building, form and pond of the sim. Also the home of the playground's and bridge's placed pieces. */
export function Builds({ sim }: { sim: Sim }) {
  useFrame(() => {
    GHOST.opacity = 0.3 + 0.1 * Math.sin(sim.time * 3)
  })
  return (
    <>
      {sim.builds.map((b) => (
        <Building key={b.id} sim={sim} b={b} />
      ))}
      {sim.forms.map((f) => (
        <FormView key={f.id} f={f} />
      ))}
      {sim.ponds.map((p, k) => (
        <PondView key={k} sim={sim} p={p} />
      ))}
    </>
  )
}
