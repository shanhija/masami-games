import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferGeometry, Float32BufferAttribute, Vector3, type Group, type Mesh } from 'three'

import { clamp01, lerp, TAU } from '../../game/math'
import { DRUM_LEN, DRUM_RADIUS, DRUM_Y, HOPPER_Z, MIXER_SAND } from '../../game/model'
import { bake, box, cylinder, lathe, Mound, part, roundBox, SOLID_MESH, sphere, Static, thickShell, type MachineProps, type Part, type V3 } from '../parts'
import { spare } from '../preload'
import { TruckBase, truckBody } from './shared-dumper'

// The cement truck's draw calls, 11 in all: chassis and cab 2, wheels 1, beacon 1, exhaust 1, drum 1, chute 2, sand 1, two lamps 2. The driver adds 1.

const PI2 = Math.PI / 2
const DRUM_Z = -1.45
/** How far the drum's rear end is raised above level. */
const TILT = 0.16
/** The hopper's funnel leans back by this much; its bottom sits at the drum's mouth. */
const LEAN = -0.3
const FUNNEL = { y: 2.3, h: 0.85 }
const CHUTE_PIVOT: V3 = [0, 2.0, -3.2]
const SEG1 = 0.9
const SEG2 = 0.8
const BULB_Y = [1.65, 1.85, 2.05, 2.25] as const
const BULB_X = 1.27

/** The drum's outline along its axis: (radius, along). The widest part is DRUM_RADIUS and the length is DRUM_LEN. */
const PROFILE: readonly (readonly [number, number])[] = [
  [0, -DRUM_LEN / 2],
  [0.5, -DRUM_LEN / 2],
  [0.78, -1.55],
  [1.03, -1.2],
  [DRUM_RADIUS, -0.7],
  [DRUM_RADIUS, 0.3],
  [0.98, 1.0],
  [0.62, DRUM_LEN / 2],
  [0, DRUM_LEN / 2],
]

function radiusAt(y: number): number {
  for (let i = 1; i < PROFILE.length - 2; i++) {
    const [r0, y0] = PROFILE[i]
    const [r1, y1] = PROFILE[i + 1]
    if (y <= y1) return lerp(r0, r1, (y - y0) / (y1 - y0))
  }
  throw new Error(`y ${y} is off the drum`)
}

/** A raised band that winds round the drum: `turns` times from y0 to y1, `width` radians wide, starting at angle `phase`. */
function spiral(phase: number, turns: number, y0: number, y1: number, width: number, lift: number): BufferGeometry {
  const pos: number[] = []
  const nor: number[] = []
  const steps = 28
  const across = 8
  const at = (y: number, th: number, up: number) => new Vector3((radiusAt(y) + up) * Math.cos(th), y, (radiusAt(y) + up) * Math.sin(th))
  // The surface normal of the drum itself, which the band's top shares so it shades smoothly.
  const skin = (y: number, th: number) => new Vector3(Math.cos(th), -(radiusAt(y + 0.01) - radiusAt(y - 0.01)) / 0.02, Math.sin(th)).normalize()
  /** A triangle wound to face the way its normals point. */
  const tri = (p: Vector3, q: Vector3, r: Vector3, np: Vector3, nq: Vector3, nr: Vector3) => {
    const facing = new Vector3().crossVectors(q.clone().sub(p), r.clone().sub(p)).dot(np.clone().add(nq).add(nr))
    const [v, n] = facing < 0 ? [[p, r, q], [np, nr, nq]] : [[p, q, r], [np, nq, nr]]
    v.forEach((point, i) => {
      pos.push(point.x, point.y, point.z)
      nor.push(n[i].x, n[i].y, n[i].z)
    })
  }
  const quad = (p: Vector3, q: Vector3, r: Vector3, s: Vector3, np: Vector3, nq: Vector3, nr: Vector3, ns: Vector3) => {
    tri(p, q, r, np, nq, nr)
    tri(p, r, s, np, nr, ns)
  }
  for (let i = 0; i < steps; i++) {
    const ya = y0 + ((y1 - y0) * i) / steps
    const yb = y0 + ((y1 - y0) * (i + 1)) / steps
    const ta = phase + (turns * TAU * (ya - y0)) / (y1 - y0)
    const tb = phase + (turns * TAU * (yb - y0)) / (y1 - y0)
    for (let j = 0; j < across; j++) {
      const a0 = ta - width / 2 + (width * j) / across
      const a1 = ta - width / 2 + (width * (j + 1)) / across
      const b0 = tb - width / 2 + (width * j) / across
      const b1 = tb - width / 2 + (width * (j + 1)) / across
      quad(at(ya, a0, lift), at(ya, a1, lift), at(yb, b1, lift), at(yb, b0, lift), skin(ya, a0), skin(ya, a1), skin(yb, b1), skin(yb, b0))
    }
    for (const side of [-1, 1]) {
      const fa = ta + (side * width) / 2
      const fb = tb + (side * width) / 2
      const out = new Vector3(-Math.sin(fa), 0, Math.cos(fa)).multiplyScalar(side)
      quad(at(ya, fa, -0.03), at(ya, fa, lift), at(yb, fb, lift), at(yb, fb, -0.03), out, out, out, out)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3))
  return g
}

/** The drum in its own frame: the axis is y, the rear end at +y. Body in the paint, two bold stripes in the colour that stands out from it, two rollers and the dark mouth. */
const DRUM: Part[] = [
  part(lathe('mixer-drum', PROFILE, 32), 'enamel', [0, 0, 0]),
  ...[0, Math.PI].map((phase) => part(spiral(phase, 1.3, -1.05, 1.4, 1.15, 0.045), 'trim', [0, 0, 0], { contrast: true })),
  ...[-0.95, 0.55].map((y) => part(cylinder(radiusAt(y) + 0.03, radiusAt(y) + 0.03, 0.14, 32), 'steel', [0, y, 0])),
  part(cylinder(0.4, 0.4, 0.05, 20), 'dark', [0, DRUM_LEN / 2 + 0.01, 0]),
  part(sphere(0.12, 10), 'chrome', [0, -DRUM_LEN / 2 - 0.02, 0], { scale: [1, 0.6, 1] }),
]

/** A point `y` up the funnel's axis, in the truck's frame. */
const onFunnel = (y: number): V3 => [0, FUNNEL.y + y * Math.cos(LEAN), HOPPER_Z + y * Math.sin(LEAN)]

/** What stays still: the drum's cradle, the hopper, the chute's hinge and the two lamp panels. */
const FRAME: Part[] = [
  part(roundBox(1.1, 0.5, 0.6, 0.1), 'dark', [0, 1.2, 0.4]),
  ...[1, -1].flatMap((s) => [
    part(roundBox(0.2, 1.15, 0.26, 0.05), 'dark', [s * 0.55, 1.55, -2.7]),
    part(cylinder(0.2, 0.2, 0.2, 14), 'steel', [s * 0.5, 1.58, 0.4], { rot: [0, 0, PI2] }),
    // The lamp panel between the cab and the drum: a plate, a hood over it.
    part(roundBox(0.14, 1.1, 0.8, 0.05), 'dark', [s * 1.2, 1.88, 0.62]),
    part(roundBox(0.3, 0.08, 0.84, 0.03), 'enamel', [s * 1.24, 2.46, 0.62], { tint: 0.85 }),
  ]),
  part(lathe('mixer-hopper', [[0.7, FUNNEL.h], [0.26, 0], [0.34, 0], [0.82, FUNNEL.h], [0.7, FUNNEL.h]], 28), 'enamel', onFunnel(0), { rot: [LEAN, 0, 0], tint: 0.9 }),
  part(thickShell(0.86, 0.76, 0.1, TAU, 28), 'hazard', onFunnel(FUNNEL.h), { rot: [LEAN, 0, 0] }),
  part(cylinder(0.4, 0.4, 0.2, 18), 'steel', onFunnel(0.02), { rot: [LEAN, 0, 0] }),
  part(roundBox(0.8, 0.3, 0.4, 0.08), 'dark', [CHUTE_PIVOT[0], CHUTE_PIVOT[1] + 0.05, CHUTE_PIVOT[2] + 0.1]),
  part(cylinder(0.07, 0.07, 0.8, 12), 'chrome', [CHUTE_PIVOT[0], CHUTE_PIVOT[1], CHUTE_PIVOT[2]], { rot: [0, 0, PI2] }),
  part(box(0.1, 0.4, 0.1), 'chrome', [0.9, 2.3, -3.0]),
]

/** The chassis mesh's parts: the shared truck body and the frame. */
const BODY = truckBody(FRAME)

const trough = (len: number, width: number): Part[] => [
  part(roundBox(width, 0.06, len, 0.02), 'steel', [0, -0.03, len / 2]),
  ...[1, -1].map((s) => part(roundBox(0.06, 0.22, len, 0.02), 'enamel', [s * (width / 2), 0.08, len / 2], { tint: 0.85 })),
  part(cylinder(0.06, 0.06, width + 0.1, 12), 'chrome', [0, 0, len], { rot: [0, 0, PI2] }),
]
const CHUTE1 = trough(SEG1, 0.66)
const CHUTE2 = trough(SEG2, 0.46)

/** Four bulbs in a column on each side: the first `lit` glow in `on`, the rest sit dark in `off`. */
function bulbs(z: number, on: string, off: string): readonly BufferGeometry[] {
  return Array.from({ length: 5 }, (_, lit) =>
    spare(
      bake(
        [1, -1].flatMap((s) => BULB_Y.map((y, i) => part(sphere(0.1, 10), i < lit ? 'lamp' : 'plush', [s * BULB_X, y, z], { colour: i < lit ? on : off }))),
        '#ffffff',
      ).solid,
    ),
  )
}
const BLUE_BULBS = bulbs(0.4, '#1e9bff', '#0f2a48')
const GREEN_BULBS = bulbs(0.82, '#2fe65a', '#0f3319')

/** The cement truck: the drum turns by `drum`, sand shows in the hopper, the chute folds out by `chute`, the blue lamp fills with `water` and the green one with `mixed`. */
export function Mixer({ m, paint, driver }: MachineProps<'mixer'>) {
  const spin = useRef<Group>(null)
  const seg1 = useRef<Group>(null)
  const seg2 = useRef<Group>(null)
  const blue = useRef<Mesh>(null)
  const green = useRef<Mesh>(null)
  // The sand heap in the hopper reads `m.sand` through the same shape the other trucks' loads have.
  const sand = useMemo(() => {
    const load = { amount: 0, kind: 'sand' as const }
    return {
      get load() {
        load.amount = m.sand
        return load
      },
    }
  }, [m])

  useFrame(() => {
    spin.current!.rotation.y = -m.drum
    const a1 = lerp(1.45, 0.7, clamp01(m.chute))
    const a2 = lerp(-1.59, 0.35, clamp01(m.chute))
    seg1.current!.rotation.x = a1
    seg2.current!.rotation.x = a2 - a1
    blue.current!.geometry = BLUE_BULBS[Math.ceil(clamp01(m.water) * 4 - 1e-6)]
    green.current!.geometry = GREEN_BULBS[Math.ceil(clamp01(m.mixed) * 4 - 1e-6)]
  })

  const [hx, hy, hz] = onFunnel(0.35)
  return (
    <group>
      <TruckBase m={m} paint={paint} driver={driver} body={BODY} />
      <group position={[0, DRUM_Y, DRUM_Z]} rotation={[-(PI2 - TILT), 0, 0]}>
        <group ref={spin}>
          <Static parts={DRUM} paint={paint} />
        </group>
      </group>
      <group position={[hx, hy, hz]} rotation={[LEAN, 0, 0]}>
        <Mound m={sand} full={MIXER_SAND} size={[0.5, 0.42, 0.5]} at={[0, 0, 0]} />
      </group>
      <group position={CHUTE_PIVOT} rotation={[0, Math.PI, 0]}>
        <group ref={seg1}>
          <Static parts={CHUTE1} paint={paint} />
          <group ref={seg2} position={[0, 0, SEG1]}>
            <Static parts={CHUTE2} paint={paint} />
          </group>
        </group>
      </group>
      <mesh ref={blue} geometry={BLUE_BULBS[0]} material={SOLID_MESH} />
      <mesh ref={green} geometry={GREEN_BULBS[0]} material={SOLID_MESH} />
    </group>
  )
}
