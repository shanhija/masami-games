/**
 * The still parts of a room merged into as few meshes as can be (plan.md, The look, people and
 * presents: a room's still solids and decor are merged into one lit and one glowing mesh). A room is built before play and most of it never moves: its
 * floors, walls and decor. Those are put together into one batch of the room, and one for each
 * mover in the mover's own frame, each batch one mesh for what is lit and one for what glows.
 *
 * Whatever the room's code then moves, turns, poses, recolours, lights up or hides is taken out
 * of its batch for good (its corners folded to a point, nothing built again) and drawn on its
 * own from then on. Decor says so itself (world.ts Decor.changed); a solid is watched by its
 * still key.
 *
 * The room's batch also holds the house round the room (shell.ts), which never changes, and never
 * the house's own solids (world.ts Solid.house), which the shell draws. Its lit mesh draws in
 * ROOM_PATTERNED, so the shell's paint carries its pattern; every other vertex carries none.
 */

import { BufferGeometry, Float32BufferAttribute, Group, Matrix4, Mesh, Vector3, type Object3D } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

import { MODEL } from '../../../silly-billy/src/scene/look'
import type { Model } from '../../../silly-billy/src/scene/recipeMesh'
import { LIGHT_RANGE } from '../engine/api'
import type { Decor, HandleId, Solid, SolidShape, World } from '../engine/world'
import { ROOM_PATTERNED } from '../patterns/look'
import { modelGeometries, type RoomModels } from './models'
import { shellGeometry } from './shell'
import { solidGeometry } from './shapes'

/** The house round the room in the room's batch: a piece no handle owns, so nothing ever takes it out. */
export const SHELL_PIECE: HandleId = -1

/** A dim room (engine/api.ts LIGHT_RANGE.dim): the scene helps the children see in it. */
export const dimRoom = (w: World) => w.shell.light < LIGHT_RANGE.dim

/** Everything about a solid that, changed, takes it out of its batch. */
export function solidKey(s: Solid): string {
  const f = s.surface
  return [s.at.join(','), s.turn, s.hidden, s.glow === null ? '' : `${s.glow.color}${s.glow.pulse}`, s.slide !== null, s.turning !== null, f.color, f.ice, f.bounce, f.belt.join(','), f.through, Object.keys(s.parts).length].join('|')
}

/** A solid that may go in a batch when the room is built: not the house's (the shell draws it), shown, not glowing, nothing under way and nothing posed. */
export const stillSolid = (s: Solid) => !s.house && !s.hidden && s.glow === null && s.slide === null && s.turning === null && Object.keys(s.parts).length === 0

/** Decor that may go in a batch: never changed, shown and not glowing. */
export const stillDecor = (d: Decor) => !d.changed && !d.hidden && d.glow === null

/** One piece of a batch: a handle's lit and glowing shapes, already in the batch's frame. */
export interface Piece {
  id: HandleId
  solid: BufferGeometry | null
  glow: BufferGeometry | null
}

/** Where a piece's corners are in its batch's merged geometry. */
interface Range {
  start: number
  count: number
}

/** The still pieces of one frame (the room's, or a mover's), merged into a lit mesh and a glowing one. */
export class Batch {
  readonly root = new Group()
  private readonly ranges = new Map<HandleId, { solid: Range | null; glow: Range | null }>()
  readonly meshes: { solid: Mesh | null; glow: Mesh | null }

  /** Takes the pieces' geometries over: they are merged and let go. */
  constructor(pieces: readonly Piece[]) {
    const merge = (which: 'solid' | 'glow'): Mesh | null => {
      const list: BufferGeometry[] = []
      let at = 0
      for (const p of pieces) {
        const g = p[which]
        const r = this.ranges.get(p.id) ?? { solid: null, glow: null }
        this.ranges.set(p.id, r)
        if (g === null) continue
        // The patterned material reads a pattern on every vertex: none where a piece has none.
        if (which === 'solid' && g.getAttribute('pattern') === undefined) g.setAttribute('pattern', new Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 4), 4))
        const count = g.getAttribute('position').count
        r[which] = { start: at, count }
        at += count
        list.push(g)
      }
      if (list.length === 0) return null
      const geometry = list.length === 1 ? list[0]! : mergeGeometries(list)
      if (geometry === null) throw new Error('the still parts of the room would not merge')
      if (list.length > 1) for (const g of list) g.dispose()
      const mesh = new Mesh(geometry, which === 'solid' ? ROOM_PATTERNED : MODEL.glow)
      this.root.add(mesh)
      return mesh
    }
    this.meshes = { solid: merge('solid'), glow: merge('glow') }
  }

  has(id: HandleId): boolean {
    return this.ranges.has(id)
  }

  /** Which piece the corner `vertex` of one of its meshes belongs to (a line from the eye meeting a triangle there), or null for another mesh. */
  pieceOf(mesh: Object3D, vertex: number): HandleId | null {
    const which = mesh === this.meshes.solid ? 'solid' : mesh === this.meshes.glow ? 'glow' : null
    if (which === null) return null
    for (const [id, r] of this.ranges) {
      const range = r[which]
      if (range !== null && vertex >= range.start && vertex < range.start + range.count) return id
    }
    return null
  }

  /** How many pieces it still holds. */
  get size(): number {
    return this.ranges.size
  }

  /** Takes a piece out: its corners are folded to one point, so it draws nothing. */
  takeOut(id: HandleId) {
    const r = this.ranges.get(id)
    if (r === undefined) throw new Error(`handle ${id} is not in this batch`)
    for (const which of ['solid', 'glow'] as const) {
      const range = r[which]
      const mesh = this.meshes[which]
      if (range === null || mesh === null) continue
      const pos = mesh.geometry.getAttribute('position')
      const arr = pos.array as Float32Array
      arr.fill(0, range.start * 3, (range.start + range.count) * 3)
      pos.needsUpdate = true
    }
    this.ranges.delete(id)
  }

  dispose() {
    this.meshes.solid?.geometry.dispose()
    this.meshes.glow?.geometry.dispose()
    this.root.removeFromParent()
  }
}

/** How tall a solid's shape is from its middle down to its bottom: where its model stands. */
export const halfHeight = (s: SolidShape) => (s.kind === 'ball' ? s.radius : s.size[1] / 2)

const place = new Matrix4()
const foot = new Matrix4()
const size = new Vector3()

/**
 * The still pieces of a room as it is built, by the frame they go in: the room's (null) and each
 * mover's. With `house`, the room's first is the house round it (SHELL_PIECE). A solid is its plain shape (its
 * top a little lighter in a dim room), or its model standing on the middle of its bottom, at its
 * middle and turned, or the look's model it is dressed in (`dressed`, by its id: scene/lookView.ts),
 * standing the same way; decor its model at its foot, turned and sized. Turned round z from the side,
 * round y from high up.
 */
export function stillPieces(world: World, models: RoomModels, house: boolean, dressed: ReadonlyMap<HandleId, Model>): Map<HandleId | null, Piece[]> {
  const pieces = new Map<HandleId | null, Piece[]>(house ? [[null, [{ id: SHELL_PIECE, solid: shellGeometry(world.shell, world.view), glow: null }]]] : [])
  const dim = dimRoom(world)
  const add = (mover: HandleId | null, p: Piece) => {
    const list = pieces.get(mover)
    if (list === undefined) pieces.set(mover, [p])
    else list.push(p)
  }
  // A turn is round z from the side, round y from high up (world.ts).
  const turned = (turn: number) => (world.view === 'high' ? place.makeRotationY(turn) : place.makeRotationZ(turn))
  for (const s of world.solids) {
    if (!stillSolid(s)) continue
    turned(s.turn).setPosition(s.at[0], s.at[1], s.at[2])
    const model = dressed.get(s.id) ?? (s.model === null ? null : models.get(s.model))
    if (model === null) add(s.mover, { id: s.id, solid: solidGeometry(s.shape, s.surface, world.view, dim).applyMatrix4(place), glow: null })
    else add(s.mover, { id: s.id, ...modelGeometries(model, place.multiply(foot.makeTranslation(0, -halfHeight(s.shape), 0))) })
  }
  for (const d of world.decor) {
    if (!stillDecor(d)) continue
    turned(d.turn).scale(size.set(d.scale, d.scale, d.scale)).setPosition(d.at[0], d.at[1], d.at[2])
    add(d.mover, { id: d.id, ...modelGeometries(models.get(d.model), place) })
  }
  return pieces
}
