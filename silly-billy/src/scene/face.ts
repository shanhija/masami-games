import { BufferGeometry, CapsuleGeometry, CatmullRomCurve3, ExtrudeGeometry, Group, LatheGeometry, Mesh, Shape, SphereGeometry, TubeGeometry, Vector2, Vector3, type MeshStandardMaterial } from 'three'

import type { Look, Mood } from '../engine/types'
import { flat, glow, palette } from './look'

/**
 * The face, drawn like an emoji so it reads when the head is a few dozen pixels across: big
 * dark eyes with a glint, a big mouth, brows, cheeks that blush, a tear when sad and a drop
 * of sweat when scared, all a little high on the head so they look up at the camera, which
 * looks down from high up. The eyes blink. Made for a head of radius 1 and scaled to the
 * head; every feature's shapes are made once and shared by every face, so a mood change
 * only swaps which shape a feature shows.
 */

type EyeShape = 'dot' | 'wide' | 'shut' | 'arc' | 'heart'
type MouthShape = 'grin' | 'smile' | 'frown' | 'o' | 'small' | 'wobble'

interface Expression {
  /** Its left eye (+x) and its right. */
  eyes: [EyeShape, EyeShape]
  mouth: MouthShape
  tongue: boolean
  /** Each brow's tilt: + lifts its inner end (worried), - drops it (cross). */
  brows: [number, number]
  /** How far the brows are raised. */
  browUp: number
  blush: 'none' | 'pink' | 'red'
  drop: 'none' | 'tear' | 'sweat'
}

const EXPRESSIONS: Record<Mood, Expression> = {
  happy: { eyes: ['dot', 'dot'], mouth: 'grin', tongue: false, brows: [0.12, 0.12], browUp: 0.04, blush: 'pink', drop: 'none' },
  sad: { eyes: ['dot', 'dot'], mouth: 'frown', tongue: false, brows: [0.55, 0.55], browUp: 0, blush: 'none', drop: 'tear' },
  surprised: { eyes: ['wide', 'wide'], mouth: 'o', tongue: false, brows: [0.05, 0.05], browUp: 0.12, blush: 'none', drop: 'none' },
  silly: { eyes: ['arc', 'dot'], mouth: 'grin', tongue: true, brows: [-0.3, 0.35], browUp: 0.05, blush: 'pink', drop: 'none' },
  angry: { eyes: ['dot', 'dot'], mouth: 'frown', tongue: false, brows: [-0.6, -0.6], browUp: -0.05, blush: 'red', drop: 'none' },
  sleepy: { eyes: ['shut', 'shut'], mouth: 'small', tongue: false, brows: [0.08, 0.08], browUp: -0.04, blush: 'pink', drop: 'none' },
  love: { eyes: ['heart', 'heart'], mouth: 'smile', tongue: false, brows: [0.2, 0.2], browUp: 0.06, blush: 'red', drop: 'none' },
  scared: { eyes: ['wide', 'wide'], mouth: 'wobble', tongue: false, brows: [0.6, 0.6], browUp: 0.1, blush: 'none', drop: 'sweat' },
}

/** A line through 2D points, as a round tube a little in front of its feature's spot. */
const stroke = (points: [number, number][], r: number) => new TubeGeometry(new CatmullRomCurve3(points.map(([x, y]) => new Vector3(x, y, 0.03))), 16, r, 5, false)

/** A shape stretched flat against the face. */
const blob = (r: number, sx: number, sy: number) => new SphereGeometry(r, 10, 8).scale(sx, sy, 0.42)

/** A heart in the x-y plane, `size` across, a little thick. */
export function heart(size: number): BufferGeometry {
  const s = new Shape()
  s.moveTo(0, -0.5)
  s.bezierCurveTo(-0.15, -0.3, -0.6, -0.15, -0.55, 0.15)
  s.bezierCurveTo(-0.5, 0.45, -0.12, 0.5, 0, 0.22)
  s.bezierCurveTo(0.12, 0.5, 0.5, 0.45, 0.55, 0.15)
  s.bezierCurveTo(0.6, -0.15, 0.15, -0.3, 0, -0.5)
  return new ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: false, curveSegments: 6 }).translate(0, 0, -0.03).scale(size, size, size)
}

/** An open laughing mouth: flat along the top, round below. */
function halfDisc(w: number, h: number): BufferGeometry {
  const s = new Shape()
  s.moveTo(-w, 0)
  for (let i = 1; i <= 10; i++) {
    const a = Math.PI + (i / 10) * Math.PI
    s.lineTo(Math.cos(a) * w, Math.sin(a) * h)
  }
  s.lineTo(-w, 0)
  return new ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: false }).translate(0, 0.06, 0)
}

const EYE: Record<EyeShape, BufferGeometry> = {
  dot: blob(0.25, 0.74, 1),
  wide: blob(0.13, 1, 1),
  shut: stroke([[-0.18, 0.05], [0, -0.06], [0.18, 0.05]], 0.05),
  arc: stroke([[-0.18, -0.06], [0, 0.08], [0.18, -0.06]], 0.05),
  heart: heart(0.48),
}
const SCLERA = blob(0.28, 0.86, 1)
const GLINT = new SphereGeometry(0.065, 6, 4)

const MOUTH: Record<MouthShape, BufferGeometry> = {
  grin: halfDisc(0.27, 0.24),
  smile: stroke([[-0.2, 0.05], [0, -0.08], [0.2, 0.05]], 0.05),
  frown: stroke([[-0.19, -0.07], [0, 0.05], [0.19, -0.07]], 0.05),
  o: blob(0.13, 0.85, 1.15),
  small: blob(0.07, 1, 1),
  wobble: stroke([[-0.2, -0.02], [-0.1, 0.05], [0, -0.03], [0.1, 0.05], [0.2, -0.02]], 0.04),
}
const TONGUE = blob(0.1, 1, 0.85)
const BROW = new CapsuleGeometry(0.045, 0.22, 2, 6).rotateZ(Math.PI / 2)
const BLUSH = blob(0.15, 1.25, 0.7)
const DROP = new LatheGeometry(
  [
    [0, -0.1],
    [0.06, -0.08],
    [0.075, -0.03],
    [0.04, 0.05],
    [0, 0.11],
  ].map(([x, y]) => new Vector2(x, y)),
  8,
).scale(1, 1, 0.5)

/** Where on the head each feature sits: around (+ toward its left) and up from the middle of the face, in radians, and how far out. */
interface Layout {
  eye: [number, number]
  brow: number
  mouth: [number, number]
  blush: [number, number]
  brows: boolean
}
const PERSON: Layout = { eye: [0.33, 0.2], brow: 0.47, mouth: [-0.13, 1.01], blush: [0.6, 0], brows: true }
const CAT: Layout = { eye: [0.4, 0.2], brow: 0.5, mouth: [-0.36, 1.15], blush: [0.64, -0.06], brows: false }
const DOG: Layout = { eye: [0.4, 0.24], brow: 0.54, mouth: [-0.43, 1.32], blush: [0.7, -0.02], brows: false }
/** Where the drop shows: under the right eye for a tear, by the left temple for sweat. */
const DROPS = { tear: [-0.36, -0.04], sweat: [0.72, 0.42] } as const

/** Puts a feature's group on the head's surface, turned so its +z looks straight out. */
function aim(g: Group, around: number, up: number, out: number) {
  g.position.set(Math.sin(around) * Math.cos(up) * out, Math.sin(up) * out, Math.cos(around) * Math.cos(up) * out)
  g.rotation.set(-up, around, 0, 'YXZ')
}

function spot(parent: Group, around: number, up: number, out = 1): Group {
  const g = new Group()
  aim(g, around, up, out)
  parent.add(g)
  return g
}

function feature(parent: Group, geometry: BufferGeometry, material: Mesh['material']): Mesh {
  const m = new Mesh(geometry, material)
  parent.add(m)
  return m
}

interface Eye {
  iris: Mesh
  sclera: Mesh
  glint: Mesh
}

export class Face {
  /** Scale it to the head's radius and hang it on the head. */
  readonly group = new Group()
  private readonly eyes: Eye[]
  private readonly brows: Mesh[]
  private readonly browSpots: Group[]
  private readonly mouth: Mesh
  private readonly tongue: Mesh
  private readonly blush: Mesh[]
  private readonly drop: Mesh
  private readonly dropAt: Group
  private readonly iris: MeshStandardMaterial
  private readonly heartColour = flat(palette.heart)
  private readonly layout: Layout

  constructor(look: Look) {
    this.layout = look.body === 'cat' ? CAT : look.body === 'dog' ? DOG : PERSON
    const l = this.layout
    this.iris = flat(look.eyes)
    this.eyes = [1, -1].map((side) => {
      const at = spot(this.group, side * l.eye[0], l.eye[1])
      const sclera = feature(at, SCLERA, flat(palette.white))
      const iris = feature(at, EYE.dot, this.iris)
      const glint = feature(at, GLINT, glow(palette.white))
      return { iris, sclera, glint }
    })
    this.browSpots = l.brows ? [1, -1].map((side) => spot(this.group, side * l.eye[0], l.brow)) : []
    this.brows = this.browSpots.map((at) => feature(at, BROW, flat(palette.ink)))
    const mouthAt = spot(this.group, 0, l.mouth[0], l.mouth[1])
    this.mouth = feature(mouthAt, MOUTH.grin, flat(palette.mouth))
    this.tongue = feature(mouthAt, TONGUE, flat(palette.tongue))
    this.tongue.position.set(0.06, -0.15, 0.05)
    this.blush = [1, -1].map((side) => feature(spot(this.group, side * l.blush[0], l.blush[1]), BLUSH, flat(palette.blush)))
    this.dropAt = spot(this.group, 0, 0)
    this.drop = feature(this.dropAt, DROP, glow(palette.drop))
  }

  /** Shows a mood; a blink closes whatever eyes are open for a moment. */
  show(mood: Mood, blink: boolean) {
    const e = EXPRESSIONS[mood]
    const l = this.layout
    this.eyes.forEach((eye, i) => {
      const shape = blink && (e.eyes[i] === 'dot' || e.eyes[i] === 'wide') ? 'shut' : e.eyes[i]
      eye.iris.geometry = EYE[shape]
      eye.iris.material = shape === 'heart' ? this.heartColour : this.iris
      eye.iris.position.set(0, shape === 'wide' ? 0.02 : 0, shape === 'wide' ? 0.08 : 0)
      eye.sclera.visible = shape === 'wide'
      eye.glint.visible = shape === 'dot' || shape === 'wide'
      eye.glint.position.set(shape === 'wide' ? 0.04 : 0.06, shape === 'wide' ? 0.07 : 0.11, 0.13)
    })
    this.browSpots.forEach((at, i) => {
      const side = i === 0 ? 1 : -1
      aim(at, side * l.eye[0], l.brow + e.browUp, 1)
      // The inner end is toward the middle of the face: for the left brow that is its -x end.
      this.brows[i]!.rotation.z = -side * e.brows[i]
    })
    this.mouth.geometry = MOUTH[e.mouth]
    this.tongue.visible = e.tongue
    for (const b of this.blush) {
      b.visible = e.blush !== 'none'
      b.material = flat(e.blush === 'red' ? palette.angry : palette.blush)
    }
    this.drop.visible = e.drop !== 'none'
    if (e.drop !== 'none') aim(this.dropAt, DROPS[e.drop][0], DROPS[e.drop][1], 1.02)
  }
}
