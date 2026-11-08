import {
  BoxGeometry,
  BufferGeometry,
  CapsuleGeometry,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  Euler,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  LatheGeometry,
  Matrix4,
  Mesh,
  Quaternion,
  SRGBColorSpace,
  Shape as Outline,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  type HSL,
  type Material,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

import { KID_HEIGHT, apply, eulerXYZ, mul, proportions } from '../engine/body'
import { boundsOf, partTransform } from '../engine/kit'
import type { ItemInfo, PartDef, PartPose, Recipe, Shape } from '../engine/types'
import { MODEL, colorOf } from './look'

/**
 * A model's recipe as three.js: every shape becomes its geometry (low-poly: spheres 12 x 8,
 * cylinders, lathes and capsules 12 round), moved, turned and stretched as the shape says
 * and painted its colour per vertex; then each part's shapes are merged into one geometry,
 * its glowing shapes into a second, so a whole bicycle draws in a few calls. A model is
 * built once per kind and tint and shared by every copy of it in the room and on people.
 */

/** One part's shapes (null: the model's own frame): the lit ones merged, and the glowing ones. */
export interface PartGeometry {
  solid: BufferGeometry | null
  glow: BufferGeometry | null
}

export interface Model {
  readonly recipe: Recipe
  /** Still the interpreter's draft: drawn see-through and pulsing. */
  readonly rough: boolean
  readonly parts: Map<string | null, PartGeometry>
}

const matrix = new Matrix4()
const quat = new Quaternion()
const euler = new Euler()
const at = new Vector3()
const stretch = new Vector3()

/**
 * A lathe's [r, y] points in the order that faces it outward. three.js turns a profile's faces
 * outward when it runs up the outside (counter-clockwise in r and y, closed along the axis), so
 * one written top to bottom would be drawn inside out: a dark shell things show through. A flat
 * profile (a disc, a brim) has no inside: it is turned to face up, toward the camera.
 */
function outwardProfile(points: number[][]): number[][] {
  const closed = [...points, [0, points.at(-1)![1]!], [0, points[0]![1]!]]
  let area = 0
  for (let i = 0; i < closed.length; i++) {
    const [r0, y0] = closed[i]!
    const [r1, y1] = closed[(i + 1) % closed.length]!
    area += r0! * y1! - r1! * y0!
  }
  const flat = Math.abs(area) < 1e-9
  return (flat ? points.at(-1)![0]! > points[0]![0]! : area < 0) ? [...points].reverse() : points
}

/** A lathe through [r, y] points that already run the way that faces it outward. */
function latheOf(points: number[][]): BufferGeometry {
  return new LatheGeometry(
    points.map((p) => new Vector2(p[0], p[1])),
    12,
  )
}

/** The shape's own geometry, centred as the kit says, before it is moved into place. */
function shapeGeometry(s: Shape): BufferGeometry {
  const d = s.dims
  switch (s.kind) {
    case 'box':
      return new BoxGeometry(d[0], d[1], d[2])
    case 'sphere':
      return new SphereGeometry(d[0], 12, 8)
    case 'cylinder':
      return new CylinderGeometry(d[0], d[1], d[2], 12)
    case 'torus':
      return new TorusGeometry(d[0], d[1], 8, 16)
    case 'capsule':
      return new CapsuleGeometry(d[0], d[1], 3, 12)
    case 'lathe':
      return latheOf(outwardProfile(s.points!))
    case 'extrude':
      return new ExtrudeGeometry(new Outline(s.points!.map((p) => new Vector2(p[0], p[1]))), { depth: d[0], bevelEnabled: false }).translate(0, 0, -d[0] / 2)
    case 'tube': {
      // A tube is open at its ends: a ball on each end rounds it off, so a curl of hair or a handlebar looks solid.
      // A tube through one point over and over has no length to run along: it is just the ball.
      const points = s.points!.map((p) => new Vector3(p[0], p[1], p[2]))
      const curve = new CatmullRomCurve3(points)
      const ends = [points[0], points[points.length - 1]].map((p) => flatten(new SphereGeometry(d[0], 6, 4).translate(p!.x, p!.y, p!.z)))
      return curve.getLength() < 1e-6 ? mergeAll(ends) : mergeAll([flatten(new TubeGeometry(curve, Math.min(64, (points.length - 1) * 6), d[0], 6, false)), ...ends])
    }
  }
}

/** Without its texture coordinates and its index, so geometries of every kind merge. */
function flatten(g: BufferGeometry): BufferGeometry {
  g.deleteAttribute('uv')
  if (g.index === null) return g
  const flat = g.toNonIndexed()
  g.dispose()
  return flat
}

function mergeAll(list: BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries(list)
  if (merged === null) throw new Error('the shapes of a model would not merge')
  for (const g of list) g.dispose()
  return merged
}

/** A mirrored shape (a negative scale) turns its faces inside out: swapping two corners of every triangle turns them back. */
function flipWinding(g: BufferGeometry) {
  for (const name of ['position', 'normal', 'color']) {
    const a = g.getAttribute(name)
    for (let i = 0; i < a.count; i += 3) {
      for (let k = 0; k < a.itemSize; k++) {
        const v = a.getComponent(i + 1, k)
        a.setComponent(i + 1, k, a.getComponent(i + 2, k))
        a.setComponent(i + 2, k, v)
      }
    }
  }
}

/** One shape in its part's frame, every vertex its colour: all of it, or the piece of it given (in the shape's own frame). */
function placed(s: Shape, color: Color, piece: BufferGeometry = shapeGeometry(s)): BufferGeometry {
  const g = flatten(piece)
  matrix.compose(at.set(s.at[0], s.at[1], s.at[2]), quat.setFromEuler(euler.set(s.rot[0], s.rot[1], s.rot[2], 'XYZ')), stretch.set(s.scale[0], s.scale[1], s.scale[2]))
  g.applyMatrix4(matrix)
  const n = g.getAttribute('position').count
  const colors = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) color.toArray(colors, i * 3)
  g.setAttribute('color', new Float32BufferAttribute(colors, 3))
  if (s.scale[0] * s.scale[1] * s.scale[2] < 0) flipWinding(g)
  return g
}

const hsl: HSL = { h: 0, s: 0, l: 0 }

/**
 * The shapes' colours, painted with `tint` when there is one: every shape takes the tint's
 * hue and saturation but keeps how much lighter or darker it was than the model's middle,
 * so a painted bicycle still shows its dark tyres apart from its frame.
 */
export function shapeColors(shapes: Shape[], tint: string | null): Color[] {
  const own = shapes.map((s) => new Color(s.color))
  if (tint === null) return own
  const paint = new Color(colorOf(tint)).getHSL({ h: 0, s: 0, l: 0 }, SRGBColorSpace)
  const lightness = own.map((c) => c.getHSL(hsl, SRGBColorSpace).l)
  const middle = lightness.reduce((a, b) => a + b, 0) / Math.max(1, lightness.length)
  return own.map((c, i) => c.setHSL(paint.h, paint.s, Math.min(0.94, Math.max(0.06, paint.l + (lightness[i] - middle) * 0.7)), SRGBColorSpace))
}

/**
 * Half of a worn body thing. On a person the part above the hips turns with the upper body
 * (bowing, twisting, leaning to a side) and the rest stays on the legs, so a gown's bodice and
 * straps go where the chest goes and its skirt stays round the legs, even a gown drawn as one
 * lathe from hem to neckline.
 */
export type Half = 'upper' | 'lower'

/** The model kid's hips (body.ts), where a worn body thing is cut in two. */
const KID_HIP_Y = proportions({ body: 'kid', height: KID_HEIGHT, build: 1 }).hipY

/**
 * Where an upright lathe crosses the model kid's hips, as a height among its own points, and
 * whether its own up is the model's down; null when it is tilted or wholly on one side.
 */
function hipCut(s: Shape, parts: PartDef[]): { y: number; flip: boolean } | null {
  const frame = partTransform(parts, s.part)
  const r = mul(frame.r, eulerXYZ(s.rot[0], s.rot[1], s.rot[2]))
  // Upright: its own x and z stay level, so how high a point is goes by its own y alone.
  if (Math.abs(r[3]) > 0.05 || Math.abs(r[5]) > 0.05) return null
  const up = r[4] * s.scale[1]
  const y = (KID_HIP_Y - apply(frame.r, s.at)[1] - frame.p[1]) / up
  const ys = s.points!.map((p) => p[1]!)
  return y > Math.min(...ys) && y < Math.max(...ys) ? { y, flip: up < 0 } : null
}

/** A lathe's points cut at height y into the runs below and the runs above, each cut end on the line itself, so the pieces meet. */
function cutProfile(points: number[][], y: number): { below: number[][][]; above: number[][][] } {
  const runs = { below: [] as number[][][], above: [] as number[][][] }
  let run = [points[0]!]
  let above = points[0]![1]! > y
  for (const p of points.slice(1)) {
    const [r0, y0] = run.at(-1)!
    if (p[1]! > y !== above) {
      const cut = [r0! + ((p[0]! - r0!) * (y - y0!)) / (p[1]! - y0!), y]
      run.push(cut)
      runs[above ? 'above' : 'below'].push(run)
      run = [cut]
      above = !above
    }
    run.push(p)
  }
  runs[above ? 'above' : 'below'].push(run)
  // A point on the line itself is not drawn twice, and a run that only touches the line is no shape.
  const tidy = (list: number[][][]) => list.map((r) => r.filter((p, i) => i === 0 || p[0] !== r[i - 1]![0] || p[1] !== r[i - 1]![1])).filter((r) => r.length >= 2)
  return { below: tidy(runs.below), above: tidy(runs.above) }
}

/**
 * What of a shape is in that half. An upright lathe that reaches across the hips, the way a
 * gown is drawn in one piece from hem to neckline, is cut there: what is below them is in the
 * lower half, the rest in the upper. Any other shape is in the half the middle of its height
 * (in the model's frame) is in.
 */
function inHalf(s: Shape, parts: PartDef[], half: Half): BufferGeometry[] {
  const cut = s.kind === 'lathe' ? hipCut(s, parts) : null
  if (cut !== null) {
    const runs = cutProfile(outwardProfile(s.points!), cut.y)
    return ((half === 'upper') !== cut.flip ? runs.above : runs.below).map(latheOf)
  }
  const { min, max } = boundsOf([s], parts)
  return ((min[1] + max[1]) / 2 > KID_HIP_Y) === (half === 'upper') ? [shapeGeometry(s)] : []
}

/** The model as three.js: all of it (half null), or one half of it with its colours still worked out from the whole. */
export function buildModel(recipe: Recipe, rough: boolean, tint: string | null, half: Half | null): Model {
  const colors = shapeColors(recipe.shapes, tint)
  const lists = new Map<string | null, { solid: BufferGeometry[]; glow: BufferGeometry[] }>()
  recipe.shapes.forEach((s, i) => {
    const pieces = half === null ? [shapeGeometry(s)] : inHalf(s, recipe.parts, half)
    if (pieces.length === 0) return
    let list = lists.get(s.part)
    if (list === undefined) {
      list = { solid: [], glow: [] }
      lists.set(s.part, list)
    }
    for (const piece of pieces) (s.glow ? list.glow : list.solid).push(placed(s, colors[i], piece))
  })
  const parts = new Map<string | null, PartGeometry>()
  for (const [part, list] of lists) parts.set(part, { solid: list.solid.length ? mergeAll(list.solid) : null, glow: list.glow.length ? mergeAll(list.glow) : null })
  return { recipe, rough, parts }
}

export function disposeModel(model: Model) {
  for (const p of model.parts.values()) {
    p.solid?.dispose()
    p.glow?.dispose()
  }
}

/** What the models are made from: the library, through the scene's source. */
export interface ModelSource {
  info(kind: string): ItemInfo
  readonly libraryVersion: number
}

/** Frames a model may go unasked for before it is let go: ten seconds. */
const UNUSED = 600
/** Tints of one kind (and half) kept past the frame they were drawn in. */
const TINTS = 4

/**
 * Every model the scene has built, by kind and tint (and half, for a body thing on a person).
 * The library's version says when to look again: a kind whose recipe is the same object as
 * before keeps its model, one that changed (the draft became the real thing) is built afresh
 * and the old one let go. A model nothing has asked for in ten seconds (a coat of paint long
 * gone, another room's things) is let go too: everything drawn asks for its model every frame.
 * A thing whose process paints it a new colour every frame would build a model a frame, so of
 * the tints of a kind nobody drew this frame or the last only the newest few are kept.
 */
export class Models {
  private readonly cache = new Map<string, { model: Model; version: number; used: number; group: string }>()
  private frame = 0

  constructor(private readonly source: ModelSource) {}

  get(kind: string, tint: string | null, half: Half | null): Model {
    const group = `${kind}|${half ?? ''}`
    const key = `${group}|${tint ?? ''}`
    const version = this.source.libraryVersion
    const known = this.cache.get(key)
    if (known !== undefined) known.used = this.frame
    if (known !== undefined && known.version === version) return known.model
    const info = this.source.info(kind)
    if (known !== undefined && known.model.recipe === info.recipe && known.model.rough === info.rough) {
      known.version = version
      return known.model
    }
    if (known !== undefined) disposeModel(known.model)
    const model = buildModel(info.recipe, info.rough, tint, half)
    this.cache.set(key, { model, version, used: this.frame, group })
    this.trim(group)
    return model
  }

  /** Lets go of a kind's tints past the newest TINTS, but never of one drawn this frame or the last: the sweep counts frames in the middle of one. */
  private trim(group: string) {
    const tints = [...this.cache].filter(([, entry]) => entry.group === group)
    if (tints.length <= TINTS) return
    tints.sort((a, b) => b[1].used - a[1].used)
    for (const [key, entry] of tints.slice(TINTS)) {
      if (this.frame - entry.used <= 1) continue
      disposeModel(entry.model)
      this.cache.delete(key)
    }
  }

  /** Once a frame: counts the frame and now and then lets go of the models nobody asked for lately. */
  sweep() {
    this.frame++
    if (this.frame % 120 !== 0) return
    for (const [key, entry] of this.cache) {
      if (this.frame - entry.used <= UNUSED) continue
      disposeModel(entry.model)
      this.cache.delete(key)
    }
  }

  dispose() {
    for (const { model } of this.cache.values()) disposeModel(model)
    this.cache.clear()
  }
}

/** A part as drawn: one group at the part's pivot, turned and sized as the recipe and the pose say. */
interface Joint {
  def: PartDef
  pivot: Group
}

/**
 * One drawn copy of a model: a group per part nested as the recipe nests them, each holding
 * that part's meshes and its child parts, so turning a wheel's part turns everything on it.
 * The geometry belongs to the model; a copy owns only its groups and meshes.
 */
export class ModelView {
  readonly root = new Group()
  readonly meshes: Mesh[] = []
  private readonly joints: Joint[] = []

  constructor(readonly model: Model) {
    const pivots = new Map<string | null, Group>([[null, this.root]])
    for (const def of model.recipe.parts) {
      const pivot = new Group()
      pivots.get(def.parent)!.add(pivot)
      pivots.set(def.name, pivot)
      this.joints.push({ def, pivot })
    }
    this.pose({})
    const solid: Material = model.rough ? MODEL.draftSolid : MODEL.solid
    const glow: Material = model.rough ? MODEL.draftGlow : MODEL.glow
    for (const [part, g] of model.parts) {
      for (const [geometry, material] of [
        [g.solid, solid],
        [g.glow, glow],
      ] as const) {
        if (geometry === null) continue
        // A draft is see-through but casts its whole shadow: from high up a thin thing reads by its shadow.
        const mesh = new Mesh(geometry, material)
        mesh.castShadow = material === solid
        mesh.receiveShadow = !model.rough
        pivots.get(part)!.add(mesh)
        this.meshes.push(mesh)
      }
    }
  }

  /**
   * Puts every part where the pose says, as the engine reckons it (world.ts's partFrame): the
   * shift added to the pivot, the angles added to the rest angles, the size times the pose's.
   * A part the pose does not name rests; a copy of a part (a name made twice) moves with the name the designer gave it.
   */
  pose(parts: Record<string, PartPose>) {
    for (const { def, pivot } of this.joints) {
      const p = parts[def.pose ?? def.name]
      if (p === undefined) {
        pivot.position.set(def.at[0], def.at[1], def.at[2])
        pivot.rotation.set(def.rot[0], def.rot[1], def.rot[2], 'XYZ')
        pivot.scale.setScalar(1)
      } else {
        pivot.position.set(def.at[0] + p.x, def.at[1] + p.y, def.at[2] + p.z)
        pivot.rotation.set(def.rot[0] + p.rx, def.rot[1] + p.ry, def.rot[2] + p.rz, 'XYZ')
        pivot.scale.setScalar(p.s)
      }
    }
  }
}
