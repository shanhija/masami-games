/**
 * The room's models (world.ts World.models, built by Silly Billy's kit) as three.js, through
 * Silly Billy's recipeMesh: each built once and shared by every handle that shows it. Here too:
 * a model's parts posed by the world's eases, a model put whole into a batch, and the glow of
 * a handle (glow(color, pulse)) as a lit material that shines in its colour.
 */

import { BufferGeometry, Matrix4, MeshStandardMaterial, type Material, type Mesh } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

import { partTransform } from '../../../silly-billy/src/engine/kit'
import type { PartPose, Recipe } from '../../../silly-billy/src/engine/types'
import { colorOf, MODEL } from '../../../silly-billy/src/scene/look'
import { buildModel, disposeModel, type Model } from '../../../silly-billy/src/scene/recipeMesh'
import type { Glow, PartTurns } from '../engine/world'
import { easeVec } from '../engine/state'

/** Every model of a room, built once. */
export class RoomModels {
  private readonly built: Model[]

  constructor(recipes: readonly Recipe[]) {
    this.built = recipes.map((r) => buildModel(r, false, null, null))
  }

  get(id: number): Model {
    const m = this.built[id]
    if (m === undefined) throw new Error(`the room has no model ${id}; it has ${this.built.length}`)
    return m
  }

  dispose() {
    for (const m of this.built) disposeModel(m)
  }
}

const rest = new Matrix4()
const whole = new Matrix4()

/** A model's shapes at rest as one lit geometry and one glowing one, moved by `matrix`: how a model goes into a batch. */
export function modelGeometries(model: Model, matrix: Matrix4): { solid: BufferGeometry | null; glow: BufferGeometry | null } {
  const lists = { solid: [] as BufferGeometry[], glow: [] as BufferGeometry[] }
  for (const [part, g] of model.parts) {
    const { p, r } = partTransform(model.recipe.parts, part)
    rest.set(r[0], r[1], r[2], p[0], r[3], r[4], r[5], p[1], r[6], r[7], r[8], p[2], 0, 0, 0, 1)
    whole.multiplyMatrices(matrix, rest)
    if (g.solid !== null) lists.solid.push(g.solid.clone().applyMatrix4(whole))
    if (g.glow !== null) lists.glow.push(g.glow.clone().applyMatrix4(whole))
  }
  const join = (list: BufferGeometry[]) => {
    if (list.length <= 1) return list[0] ?? null
    const out = mergeGeometries(list)
    if (out === null) throw new Error("a model's parts would not merge")
    for (const g of list) g.dispose()
    return out
  }
  return { solid: join(lists.solid), glow: join(lists.glow) }
}

/** The parts as the room's code posed them, at t: Silly Billy's part poses, turns only. */
export function partPoses(parts: PartTurns, t: number): Record<string, PartPose> {
  const out: Record<string, PartPose> = {}
  for (const name in parts) {
    const [rx, ry, rz] = easeVec(parts[name]!, t)
    out[name] = { x: 0, y: 0, z: 0, rx, ry, rz, s: 1 }
  }
  return out
}

/** How bright a glow shines: steady, or for a pulsing one between its low and its high, slowly. */
export const GLOW = { steady: 0.45, low: 0.1, high: 0.6, perSecond: 0.5 } as const

const glowing = new Map<string, MeshStandardMaterial>()

/** The lit material of a handle that glows: its own colours, shining in the glow's. Made once for each colour and pulse; pulseGlows sets how bright. */
export function glowMaterial(glow: Glow): MeshStandardMaterial {
  const hex = colorOf(glow.color)
  const key = `${hex}|${glow.pulse}`
  let mat = glowing.get(key)
  if (mat === undefined) {
    mat = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, emissive: hex, emissiveIntensity: GLOW.steady })
    mat.userData.pulse = glow.pulse
    glowing.set(key, mat)
  }
  return mat
}

/** How far through its pulse every pulsing glow is at t, 0 to 1: all pulse together. */
export const pulseAt = (t: number) => 0.5 - 0.5 * Math.cos(2 * Math.PI * GLOW.perSecond * t)

/** Once a frame: every pulsing glow to its brightness now. */
export function pulseGlows(t: number) {
  const k = pulseAt(t)
  for (const mat of glowing.values()) if (mat.userData.pulse === true) mat.emissiveIntensity = GLOW.low + (GLOW.high - GLOW.low) * k
}

/** A drawn copy's lit meshes in a glow's material, or back in the model's own. */
export function glowMeshes(meshes: readonly Mesh[], glow: Glow | null) {
  const lit: Material = glow === null ? MODEL.solid : glowMaterial(glow)
  for (const mesh of meshes) if (mesh.material === MODEL.solid || (mesh.material as Material).userData.pulse !== undefined) mesh.material = lit
}
