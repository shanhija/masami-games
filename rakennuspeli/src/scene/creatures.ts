/**
 * The town's animals: chubby, big-headed toys standing on two legs, one shape per species,
 * built once and shared. Each is at most three meshes: `body` (body, head, face, ears, arms,
 * tail and the optional hard hat, merged with vertex colours), and the two legs, which the
 * scene swings by transform. Draw them with `SOLID` from parts.ts.
 *
 * Frame: facing +z, y up, standing on y = 0. A leg's geometry is built around its own hip, so
 * a leg mesh sits at (+-hipX, hipY, 0) and swings by `rotation.x` (above 0 swings the foot back).
 */

import { Euler, Quaternion, Vector3, type BufferGeometry } from 'three'

import { DRIVER_SPECIES, FRIEND_OF, HAT_COLOURS, RANKS, type Species } from '../game/model'
import { arch, bake, cylinder, lathe, part, roundBox, sphere, type Part, type V3 } from './parts'
import { spare } from './preload'

export interface Creature {
  body: BufferGeometry
  /** Left leg (at +hipX) then right leg (at -hipX). */
  legs: readonly [BufferGeometry, BufferGeometry]
  hipX: number
  hipY: number
  /** Feet to the top of the head, hat not counted. */
  height: number
}

export const HIP_X = 0.12
export const HIP_Y = 0.27
/** The head's top; the hard hat adds about 0.12 above it. */
export const CREATURE_HEIGHT = 1.32

const UP = new Vector3(0, 1, 0)
const FORWARD = new Vector3(0, 0, 1)
const q = new Quaternion()
const e = new Euler()
const v = new Vector3()

/** The rotation that turns the +y (or +z) axis of a part onto direction d. */
const alignTo = (axis: Vector3, d: V3): V3 => {
  e.setFromQuaternion(q.setFromUnitVectors(axis, v.set(...d).normalize()))
  return [e.x, e.y, e.z]
}

/** A soft ellipsoid with these radii. */
const ell = (at: V3, radii: V3, colour: string, rot: V3 = [0, 0, 0], seg = 8) => part(sphere(1, seg), 'plush', at, { scale: radii, colour, rot })
/** A glossy ellipsoid (eyes, noses). */
const gloss = (at: V3, radii: V3, colour: string, rot: V3 = [0, 0, 0]) => part(sphere(1, 8), 'trim', at, { scale: radii, colour, rot })
const cone = (at: V3, r: number, h: number, colour: string, rot: V3 = [0, 0, 0]) => part(cylinder(0, r, h, 8), 'plush', at, { colour, rot })

/** n directions spread evenly over the cap of a sphere that opens `reach` radians around -z (the back). */
function backDirs(n: number, reach: number): V3[] {
  const out: V3[] = []
  for (let i = 0; i < n; i++) {
    const t = reach * Math.sqrt((i + 0.5) / n)
    const a = i * 2.399
    out.push([Math.sin(t) * Math.cos(a), Math.sin(t) * Math.sin(a), -Math.cos(t)])
  }
  return out
}

const HEAD_Y = 1.02

/** The hard hat's dome: a short wall, then a rounded top, as (radius, height) up from the brim. */
const HAT_DOME: [number, number][] = [
  [0.318, 0],
  [0.322, 0.04],
  ...Array.from({ length: 11 }, (_, i): [number, number] => {
    const a = ((i + 1) / 11) * (Math.PI / 2)
    return [0.322 * Math.cos(a) ** 0.9, 0.04 + 0.2 * Math.sin(a) ** 0.95]
  }),
]

function build(species: Species, hat: string | null, seated: boolean): { body: Part[]; leg: Part[] } {
  const body: Part[] = []
  const leg: Part[] = []
  // Colours: main, belly, and the limb colours; the rest are per species below.
  const c = {
    hedgehog: { main: '#966a46', belly: '#f4dcb4', leg: '#f0cf9f', foot: '#f0cf9f' },
    bunny: { main: '#fbf2ea', belly: '#ffffff', leg: '#fbf2ea', foot: '#fbf2ea' },
    duck: { main: '#ffd83a', belly: '#fff0a6', leg: '#ff9a1f', foot: '#ff9a1f' },
    pig: { main: '#ffa8c2', belly: '#ffc4d6', leg: '#ffa8c2', foot: '#ff86a8' },
    cat: { main: '#ff9b3d', belly: '#ffe8c8', leg: '#ff9b3d', foot: '#ffe8c8' },
    dog: { main: '#d9a866', belly: '#f7e6c4', leg: '#d9a866', foot: '#f7e6c4' },
    cow: { main: '#fbfbfb', belly: '#ffffff', leg: '#fbfbfb', foot: '#3a3a42' },
    sheep: { main: '#fdfaf4', belly: '#fdfaf4', leg: '#4a4650', foot: '#4a4650' },
    fox: { main: '#ff7a22', belly: '#fff4e6', leg: '#3a2a28', foot: '#3a2a28' },
    bear: { main: '#8c5b3b', belly: '#dfbb90', leg: '#8c5b3b', foot: '#e0bf96' },
    frog: { main: '#5ec55a', belly: '#eaf6b4', leg: '#5ec55a', foot: '#4fb04c' },
  }[species]

  // Body, belly, head.
  body.push(ell([0, 0.56, 0], [0.27, 0.31, 0.24], c.main, [0, 0, 0], 16))
  body.push(ell([0, 0.52, 0.08], [0.2, 0.24, 0.18], c.belly, [0, 0, 0], 16))
  const headColour = species === 'hedgehog' ? '#8f633f' : species === 'sheep' ? '#4a4650' : c.main
  body.push(ell([0, HEAD_Y, 0.02], [0.33, 0.3, 0.31], headColour, [0, 0, 0], 16))

  // Arms hang at the sides, or reach forward to the levers when seated.
  for (const s of [-1, 1]) {
    const armColour = species === 'sheep' ? '#4a4650' : species === 'duck' ? '#f3c92a' : c.main
    const handColour = species === 'cow' || species === 'fox' ? c.foot : c.main
    if (seated) {
      const from = new Vector3(s * 0.29, 0.66, 0.05)
      const to = new Vector3(s * 0.17, 0.86, 0.5)
      const mid = from.clone().add(to).multiplyScalar(0.5)
      const dir = to.clone().sub(from)
      body.push(ell([mid.x, mid.y, mid.z], [0.07, dir.length() / 2 + 0.03, 0.075], armColour, alignTo(UP, [dir.x, dir.y, dir.z])))
      body.push(ell([to.x, to.y, to.z], [0.08, 0.08, 0.085], handColour))
    } else {
      body.push(ell([s * 0.31, 0.56, 0.04], [0.075, 0.17, 0.08], armColour, [0, 0, s * 0.22]))
      body.push(ell([s * 0.35, 0.43, 0.06], [0.08, 0.08, 0.085], handColour))
    }
  }

  // Under a hard hat, ears and horns stand out beside the dome instead of through it.
  const worn = hat !== null

  // Eyes (frog and sheep set their own).
  const eye = (x: number, y: number, z: number, r: number) => {
    body.push(gloss([x, y, z], [r, r * 1.15, r * 0.6], '#17151c'))
    body.push(gloss([x + r * 0.35, y + r * 0.45, z + r * 0.4], [r * 0.32, r * 0.32, r * 0.2], '#ffffff'))
  }
  if (species !== 'frog') eye(0.125, 1.07, 0.3, 0.05)
  if (species !== 'frog') eye(-0.125, 1.07, 0.3, 0.05)
  const nose = (x: number, y: number, z: number, r: number, colour: string) => body.push(gloss([x, y, z], [r * 1.2, r, r], colour))
  const blush = () => {
    for (const s of [-1, 1]) body.push(ell([s * 0.21, 0.96, 0.24], [0.06, 0.04, 0.03], '#ff8aa0', [0, s * 0.5, 0]))
  }

  switch (species) {
    case 'hedgehog': {
      // A pointed cream snout with a black nose, small ears low on the sides.
      body.push(ell([0, 1.0, 0.16], [0.25, 0.22, 0.2], c.belly, [0, 0, 0], 12))
      body.push(part(cylinder(0.035, 0.13, 0.28, 12), 'plush', [0, 0.97, 0.36], { colour: c.belly, rot: [Math.PI / 2, 0, 0] }))
      nose(0, 0.975, 0.51, 0.05, '#1c1418')
      for (const s of [-1, 1]) {
        body.push(ell([s * 0.28, 1.13, 0.04], [0.065, 0.075, 0.04], '#8f633f', [0, 0, s * 0.5]))
        body.push(ell([s * 0.285, 1.13, 0.065], [0.04, 0.05, 0.02], '#ffb3bf', [0, 0, s * 0.5]))
      }
      // Spines all over the back, the shoulders and the head's crown: a dark cone with a pale sleeve at its tip.
      const spine = (at: V3, d: V3, r: number, len: number, i: number) => {
        const out = new Vector3(d[0], d[1] + 0.25, d[2] - 0.35).normalize()
        const rot = alignTo(UP, [out.x, out.y, out.z])
        const centre = (k: number): V3 => [at[0] + out.x * len * k, at[1] + out.y * len * k, at[2] + out.z * len * k]
        body.push(part(cylinder(0, r, len, 4), 'plush', centre(0.5), { colour: i % 2 === 0 ? '#4a3123' : '#6a4630', rot }))
        body.push(part(cylinder(0, r * 0.52, len * 0.5, 4), 'plush', centre(0.75), { colour: i % 3 === 0 ? '#ead2a4' : '#c9a574', rot, scale: [1.06, 1, 1.06] }))
      }
      const quill = seated ? 0.75 : 1
      backDirs(seated ? 130 : 190, 2.25).forEach((d, i) => {
        if (d[1] < -0.5) return
        const r = Math.hypot(d[0] * 0.27, d[1] * 0.31, d[2] * 0.24) * 0.9
        spine([d[0] * r, 0.56 + d[1] * r * 1.1, d[2] * r], d, 0.06, 0.24 * quill, i)
      })
      backDirs(seated ? 50 : 70, 2.3).forEach((d, i) => {
        if (d[1] < -0.15 || d[1] > (hat === null ? 1 : 0.3)) return
        const r = Math.hypot(d[0] * 0.33, d[1] * 0.3, d[2] * 0.31) * 0.9
        spine([d[0] * r, HEAD_Y + d[1] * r, 0.02 + d[2] * r], d, 0.07, 0.26 * quill, i)
      })
      blush()
      break
    }
    case 'bunny': {
      // Seated, the ears flop out sideways so they stay under the cab roof.
      for (const s of [-1, 1]) {
        const lean = seated ? 1.0 : worn ? 0.3 : 0.12
        const at: V3 = seated ? [s * 0.34, 1.3, -0.02] : [s * (worn ? 0.22 : 0.13), 1.58, -0.02]
        const len = seated ? 0.2 : 0.3
        body.push(ell(at, [0.075, len, 0.045], c.main, [0, 0, -s * lean]))
        body.push(ell([at[0], at[1], at[2] + 0.032], [0.045, len * 0.77, 0.02], '#ffb4c6', [0, 0, -s * lean]))
      }
      body.push(ell([0, 0.97, 0.26], [0.13, 0.1, 0.09], c.belly))
      nose(0, 1.01, 0.33, 0.036, '#ff8fae')
      body.push(part(roundBox(0.06, 0.05, 0.02, 0.008), 'trim', [0, 0.92, 0.335], { colour: '#ffffff' }))
      body.push(ell([0, 0.46, -0.27], [0.11, 0.11, 0.11], '#ffffff', [0, 0, 0], 10))
      blush()
      break
    }
    case 'duck': {
      body.push(ell([0, 0.97, 0.37], [0.15, 0.05, 0.13], '#ff9a1f', [0.08, 0, 0]))
      body.push(ell([0, 0.92, 0.36], [0.13, 0.035, 0.1], '#f27d12'))
      for (let i = 0; i < 3; i++) body.push(ell([0.0 + (i - 1) * 0.04, 1.34 + (i === 1 ? 0.02 : 0), 0.0], [0.04, 0.06, 0.04], '#ffd83a', [0, 0, (i - 1) * 0.4]))
      body.push(cone([0, 0.5, -0.3], 0.1, 0.22, '#f3c92a', [-0.9, 0, 0]))
      blush()
      break
    }
    case 'pig': {
      body.push(part(cylinder(0.125, 0.135, 0.11, 18), 'plush', [0, 0.97, 0.34], { colour: '#ff86a8', rot: [Math.PI / 2, 0, 0] }))
      for (const s of [-1, 1]) {
        body.push(ell([s * 0.045, 0.97, 0.4], [0.02, 0.032, 0.012], '#b34a6e'))
        body.push(cone([s * (worn ? 0.29 : 0.21), worn ? 1.24 : 1.32, 0.06], 0.11, 0.2, '#ff86a8', [0.5, 0, s * (worn ? 1.2 : 0.8)]))
      }
      for (let i = 0; i < 4; i++) {
        const a = i * 1.2
        body.push(ell([Math.sin(a) * 0.05, 0.42 + Math.cos(a) * 0.05, -0.27 - i * 0.03], [0.04, 0.04, 0.04], '#ff86a8'))
      }
      blush()
      break
    }
    case 'cat': {
      for (const s of [-1, 1]) {
        body.push(cone([s * (worn ? 0.27 : 0.19), worn ? 1.3 : 1.36, 0.0], 0.12, 0.24, c.main, [0, 0, -s * (worn ? 0.75 : 0.3)]))
        body.push(cone([s * (worn ? 0.265 : 0.185), worn ? 1.28 : 1.34, 0.03], 0.075, 0.17, '#ffb3c4', [0.1, 0, -s * (worn ? 0.75 : 0.3)]))
        for (let k = 0; k < 3; k++) {
          body.push(part(cylinder(0.006, 0.006, 0.2, 5), 'plush', [s * 0.28, 0.96 + (k - 1) * 0.04, 0.25], { colour: '#ffffff', rot: [0, 0, Math.PI / 2 + (k - 1) * 0.25 * s] }))
        }
      }
      if (!worn) for (const k of [-1, 0, 1]) body.push(ell([k * 0.07, 1.28, 0.27], [0.014, 0.055, 0.01], '#b8631c', [-0.4, 0, k * 0.3]))
      body.push(ell([0, 0.96, 0.27], [0.13, 0.09, 0.08], c.belly))
      nose(0, 1.0, 0.34, 0.032, '#ff7f9f')
      const tail: V3[] = [[0, 0.4, -0.27], [0, 0.34, -0.4], [0, 0.4, -0.52], [0, 0.55, -0.56], [0, 0.7, -0.52]]
      tail.forEach((p, i) => body.push(ell(p, [0.065, 0.065, 0.065], i === 4 ? '#ffe8c8' : c.main)))
      blush()
      break
    }
    case 'dog': {
      for (const s of [-1, 1]) body.push(ell([s * 0.3, 1.04, 0.02], [0.06, 0.18, 0.11], '#8a5a34', [0, 0, s * 0.2]))
      body.push(ell([-0.13, 1.09, 0.28], [0.08, 0.07, 0.04], '#8a5a34'))
      body.push(ell([0, 0.95, 0.3], [0.15, 0.11, 0.12], c.belly))
      nose(0, 1.0, 0.42, 0.048, '#1c1418')
      body.push(ell([0, 0.86, 0.36], [0.04, 0.02, 0.06], '#ff7f9f'))
      body.push(cone([0, 0.5, -0.3], 0.07, 0.25, '#8a5a34', [-1.1, 0, 0]))
      body.push(ell([0.12, 0.7, -0.1], [0.1, 0.09, 0.05], '#a06c3f', [0, 0.6, 0]))
      break
    }
    case 'cow': {
      for (const s of [-1, 1]) {
        body.push(cone([s * (worn ? 0.27 : 0.18), worn ? 1.28 : 1.34, 0.0], 0.05, 0.16, '#f4e6c8', [0, 0, -s * (worn ? 0.9 : 0.5)]))
        body.push(ell([s * 0.36, 1.1, 0.0], [0.13, 0.05, 0.07], '#2a2a30', [0, 0, s * 0.25]))
      }
      body.push(ell([0, 0.92, 0.27], [0.18, 0.12, 0.1], '#ffb3c1'))
      for (const s of [-1, 1]) body.push(ell([s * 0.06, 0.93, 0.365], [0.025, 0.035, 0.012], '#b34a5e'))
      const patch = (d: V3, at: V3, r: V3) => body.push(ell(at, r, '#2a2a30', alignTo(FORWARD, d), 8))
      patch([0.7, 0.3, 0.6], [0.2, 0.68, 0.14], [0.11, 0.09, 0.04])
      patch([-0.6, -0.2, 0.8], [-0.16, 0.5, 0.2], [0.12, 0.1, 0.04])
      patch([-0.8, 0.3, -0.4], [-0.22, 0.62, -0.1], [0.12, 0.1, 0.04])
      patch([-0.7, 0.7, 0.2], [-0.2, 1.2, 0.12], [0.12, 0.1, 0.04])
      patch([0.3, 0.2, -1], [0.1, 0.5, -0.22], [0.11, 0.09, 0.04])
      body.push(part(cylinder(0.014, 0.014, 0.3, 6), 'plush', [0, 0.42, -0.26], { colour: '#fbfbfb', rot: [0.4, 0, 0] }))
      body.push(ell([0, 0.25, -0.34], [0.05, 0.07, 0.05], '#2a2a30'))
      break
    }
    case 'sheep': {
      // Wool: a cloud on the head and round the body.
      const wool = '#fdfaf4'
      ;[[0, 1.3, 0.02], [0.15, 1.27, 0.0], [-0.15, 1.27, 0.0], [0.08, 1.31, 0.12], [-0.08, 1.31, 0.12], [0, 1.27, -0.14]].forEach((p) => body.push(ell(p as unknown as V3, [0.12, 0.1, 0.11], wool, [0, 0, 0], 9)))
      const dirs: V3[] = [[1, 0.2, 0.2], [-1, 0.2, 0.2], [0.8, 0.6, 0], [-0.8, 0.6, 0], [0, 0.4, -1], [0.7, 0.2, -0.7], [-0.7, 0.2, -0.7], [0.8, -0.4, 0.3], [-0.8, -0.4, 0.3], [0.5, -0.3, -0.8], [-0.5, -0.3, -0.8], [0, 0.9, 0.2], [0.4, 0.3, 0.9], [-0.4, 0.3, 0.9]]
      for (const d of dirs) {
        const n = new Vector3(...d).normalize()
        body.push(ell([n.x * 0.27, 0.56 + n.y * 0.3, n.z * 0.24], [0.13, 0.13, 0.12], wool, [0, 0, 0], 9))
      }
      body.push(ell([0, 0.97, 0.3], [0.1, 0.075, 0.07], '#5e5a66'))
      nose(0, 0.99, 0.36, 0.03, '#2b2630')
      for (const s of [-1, 1]) body.push(ell([s * 0.3, 1.1, 0.04], [0.11, 0.045, 0.065], '#4a4650', [0, 0, s * 0.3]))
      blush()
      break
    }
    case 'fox': {
      for (const s of [-1, 1]) {
        body.push(cone([s * (worn ? 0.27 : 0.19), worn ? 1.32 : 1.38, 0.0], 0.12, 0.28, c.main, [0, 0, -s * (worn ? 0.6 : 0.22)]))
        body.push(cone([s * (worn ? 0.34 : 0.2), worn ? 1.45 : 1.52, 0.0], 0.065, 0.12, '#2a1d1a', [0, 0, -s * (worn ? 0.6 : 0.22)]))
        body.push(ell([s * 0.19, 0.93, 0.18], [0.14, 0.1, 0.13], c.belly))
      }
      body.push(ell([0, 0.95, 0.3], [0.11, 0.085, 0.14], c.belly))
      nose(0, 0.99, 0.44, 0.04, '#1c1418')
      body.push(ell([0, 0.45, -0.42], [0.14, 0.14, 0.3], c.main, [-0.6, 0, 0], 12))
      body.push(ell([0, 0.62, -0.61], [0.1, 0.1, 0.1], '#fff4e6', [0, 0, 0], 10))
      break
    }
    case 'bear': {
      for (const s of [-1, 1]) {
        body.push(ell([s * (worn ? 0.29 : 0.24), worn ? 1.22 : 1.28, -0.02], [0.11, 0.11, 0.07], c.main))
        body.push(ell([s * (worn ? 0.29 : 0.24), worn ? 1.22 : 1.28, 0.02], [0.065, 0.065, 0.04], '#e8c9a0'))
      }
      body.push(ell([0, 0.95, 0.27], [0.16, 0.12, 0.11], '#e8cba2'))
      nose(0, 1.0, 0.37, 0.05, '#241a1a')
      body.push(ell([0, 0.45, -0.26], [0.07, 0.07, 0.06], c.main))
      blush()
      break
    }
    case 'frog': {
      for (const s of [-1, 1]) {
        body.push(gloss([s * 0.16, 1.27, 0.1], [0.11, 0.11, 0.1], '#f4fff0'))
        body.push(gloss([s * 0.16, 1.28, 0.18], [0.06, 0.07, 0.04], '#17151c'))
        body.push(gloss([s * 0.175, 1.3, 0.215], [0.02, 0.02, 0.012], '#ffffff'))
        body.push(ell([s * 0.2, 0.93, 0.22], [0.06, 0.04, 0.03], '#ff8aa0', [0, s * 0.5, 0]))
      }
      body.push(ell([0, 0.93, 0.3], [0.17, 0.014, 0.03], '#2a4a2c', [0, 0, 0]))
      body.push(ell([0, 0.9, 0.29], [0.12, 0.014, 0.026], '#ff7f9f', [0, 0, 0]))
      for (const s of [-1, 1]) body.push(ell([s * 0.05, 1.04, 0.33], [0.014, 0.014, 0.01], '#2a4a2c'))
      break
    }
  }

  // The hard hat: one smooth dome with a round brim that is longer at the front, and a single raised ridge.
  if (hat !== null) {
    const z = species === 'frog' ? -0.04 : 0
    body.push(part(lathe('hat-dome', HAT_DOME, 18), 'enamel', [0, 1.135, 0.02 + z], { colour: hat }))
    body.push(part(sphere(1, 14), 'enamel', [0, 1.165, 0.05 + z], { colour: hat, scale: [0.37, 0.028, 0.39] }))
    body.push(part(arch(0.07), 'enamel', [0, 1.165, 0.02 + z], { colour: hat, tint: 0.88, rot: [0, Math.PI / 2, 0], scale: [0.34, 0.215, 0.3] }))
  }

  // One leg around its hip: a short stump and a foot.
  const wide = species === 'duck' || species === 'frog'
  leg.push(part(cylinder(0.075, 0.068, 0.2, 10), 'plush', [0, -0.11, 0], { colour: c.leg }))
  leg.push(ell([0, -0.235, wide ? 0.07 : 0.05], wide ? [0.11, 0.04, 0.17] : [0.1, 0.05, 0.14], c.foot, [0, 0, 0], 10))
  // Seated: the legs stick out forward from the hips, and the feet rest on the floor.
  if (seated) {
    for (const s of [-1, 1]) {
      body.push(part(cylinder(0.085, 0.075, 0.36, 10), 'plush', [s * 0.14, 0.3, 0.2], { colour: c.leg, rot: [Math.PI / 2 + 0.08, 0, 0] }))
      body.push(ell([s * 0.14, 0.25, wide ? 0.4 : 0.38], wide ? [0.11, 0.05, 0.17] : [0.1, 0.055, 0.14], c.foot, [0, 0, 0], 10))
    }
  }
  return { body, leg }
}

const cache = new Map<string, Creature>()

/** The animal's merged geometry, with or without a hard hat of this colour; `seated` gives the pose for a cab (arms forward, legs out, no separate legs). Cached and shared: never dispose it. Every geometry made is a `spare`, so the upload sends the ones no scene holds yet. */
export function creature(species: Species, hat: string | null, seated = false): Creature {
  const key = `${species}|${hat}|${seated}`
  let c = cache.get(key)
  if (!c) {
    const { body, leg } = build(species, hat, seated)
    // The right leg is the left one; both are the same shape, so they share it.
    const legGeo = spare(bake(leg, '#ffffff').solid)
    c = { body: spare(bake(body, '#ffffff').solid), legs: [legGeo, legGeo], hipX: HIP_X, hipY: HIP_Y, height: CREATURE_HEIGHT }
    cache.set(key, c)
  }
  return c
}

/** Makes every shape that can sit in a cab, so none is made in the middle of play: the child's species and the friends' species, each in every hat colour a child or a friend can wear, seated. Cheap to call again. */
export function warmDrivers(): void {
  const species = new Set<Species>([...DRIVER_SPECIES, ...Object.values(FRIEND_OF)])
  const hats = new Set<string>([...HAT_COLOURS, RANKS[RANKS.length - 1].hat])
  for (const sp of species) for (const hat of hats) creature(sp, hat, true)
}
