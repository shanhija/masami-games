import { Box3, Euler, Vector3, type Mesh } from 'three'
import { describe, expect, it } from 'vitest'

import { makeCast } from '../content'
import { proportions } from '../engine/body'
import { buildRecipe } from '../engine/kit'
import { createWorld } from '../engine/sim'
import { restPart, type ItemInfo, type Recipe, type Worn } from '../engine/types'
import { ActorLayer } from './Actors'
import { MODEL } from './look'
import { Models } from './recipeMesh'

/** lib1's gown: a skirt to the waist, then a bodice to the shoulders with a sash and two straps. */
const gown = buildRecipe((m) => {
  m.lathe([[0.36, 0.03], [0.34, 0.1], [0.27, 0.3], [0.19, 0.45], [0.15, 0.5], [0, 0.5]], { color: '#f7a8c8' })
  m.lathe([[0.15, 0.48], [0.14, 0.56], [0.16, 0.66], [0.15, 0.69], [0, 0.69]], { color: '#f7a8c8' })
  m.torus(0.15, 0.022, { at: [0, 0.5, 0], rot: [Math.PI / 2, 0, 0], color: '#e4789f' })
  for (const x of [-0.11, 0.11]) m.capsule(0.02, 0.1, { at: [x, 0.71, 0], color: '#e4789f' })
  return { carry: 'hand', wear: 'body' }
}).recipe

/** A wand with a star that its process spins. */
const wand = buildRecipe((m) => {
  m.cylinder(0.015, 0.015, 0.4, { at: [0, 0.2, 0], color: '#8a5a34' })
  m.part('star', { at: [0, 0.42, 0] }, () => m.box(0.12, 0.12, 0.03, { color: '#f5d33b' }))
  m.anchor('hand', [0, 0.05, 0])
  return { carry: 'hand', wear: 'hand' }
}).recipe

/** Gowns drawn as one lathe from hem to neckline: from Opus tonight, and a floor-length one. */
const oneLathe = buildRecipe((m) => {
  m.lathe([[0.3, 0.28], [0.27, 0.34], [0.17, 0.42], [0.14, 0.5], [0.16, 0.6], [0.17, 0.67], [0.1, 0.71], [0.08, 0.72]], { color: '#f7a1c4' })
  return { carry: 'hand', wear: 'body' }
}).recipe
const longDress = buildRecipe((m) => {
  m.lathe([[0.34, 0.03], [0.3, 0.2], [0.2, 0.4], [0.15, 0.5], [0.16, 0.62], [0.12, 0.69], [0, 0.69]], { color: '#7fb3ff' })
  return { carry: 'hand', wear: 'body' }
}).recipe

const RECIPES: Record<string, Recipe> = { gown, wand, oneLathe, longDress }
const source = { libraryVersion: 1, info: (kind: string): ItemInfo => ({ kind, name: kind, nameFi: kind, recipe: RECIPES[kind]!, size: [1, 1, 1], radius: 0.5, rough: false }) }

/** Noora at the room's middle facing the camera, wearing only what the test says. */
function dressed(worn: Partial<Record<'body' | 'hand', Worn>>) {
  const noora = makeCast().find((c) => c.id === 'noora')!
  const world = createWorld({ room: 'playground', actors: [noora], layouts: { playground: [], pool: [], forest: [] }, seed: 1 })
  const a = world.actors[0]!
  Object.assign(a, { x: 0, z: 0, yaw: 0 })
  a.look.worn = worn
  return { world, a, layer: new ActorLayer(new Models(source)) }
}

/** The middles of the worn thing's drawn pieces, lowest first. */
function wornPieces(layer: ActorLayer): Vector3[] {
  layer.root.updateMatrixWorld(true)
  const meshes: Mesh[] = []
  layer.root.traverse((o) => void ((o as Mesh).isMesh && (o as Mesh).material === MODEL.solid && meshes.push(o as Mesh)))
  return meshes.map((m) => new Box3().setFromObject(m).getCenter(new Vector3())).sort((p, q) => p.y - q.y)
}

describe('what avatars wear', () => {
  it('bows a gown’s bodice with the upper body while its skirt stays round the legs', () => {
    const { world, a, layer } = dressed({ body: { kind: 'gown', tint: null } })
    layer.update(world, 0)
    const [skirt, bodice] = wornPieces(layer)
    expect(wornPieces(layer)).toHaveLength(2)
    // Standing, the bodice sits on the skirt from the waist up.
    expect(bodice!.y).toBeGreaterThan(skirt!.y)

    a.pose.lean = 0.8
    layer.update(world, 0)
    const [skirtBowed, bodiceBowed] = wornPieces(layer)
    expect(skirtBowed!.distanceTo(skirt!)).toBeLessThan(1e-9)
    // The bodice turns about the hips exactly as the upper body does.
    const hips = new Vector3(0, proportions(a.look).hipY, 0)
    const want = bodice!.clone().sub(hips).applyEuler(new Euler(0.8, 0, 0, 'YXZ')).add(hips)
    expect(bodiceBowed!.distanceTo(want)).toBeLessThan(1e-6)
    expect(bodiceBowed!.z).toBeGreaterThan(bodice!.z + 0.05)
  })

  it('keeps the skirt of a gown drawn as one lathe round the legs, and bows the rest with the chest', () => {
    /** Every point of the worn thing in the room. */
    const points = (layer: ActorLayer) => {
      layer.root.updateMatrixWorld(true)
      const out: Vector3[] = []
      layer.root.traverse((o) => {
        const m = o as Mesh
        if (!m.isMesh || m.material !== MODEL.solid) return
        const pos = m.geometry.getAttribute('position')
        for (let i = 0; i < pos.count; i++) out.push(new Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld))
      })
      return out
    }
    for (const kind of ['oneLathe', 'longDress']) {
      const { world, a, layer } = dressed({ body: { kind, tint: null } })
      const hips = proportions(a.look).hipY
      layer.update(world, 0)
      const standing = points(layer)
      // As deep as lib1's dance ends and the pick-up bends.
      a.pose.lean = 0.7
      layer.update(world, 0)
      const bowing = points(layer)
      expect(bowing).toHaveLength(standing.length)
      const below = standing.flatMap((p, i) => (p.y < hips - 1e-6 ? [i] : []))
      const above = standing.flatMap((p, i) => (p.y > hips + 0.1 ? [i] : []))
      expect(below.length).toBeGreaterThan(20)
      expect(above.length).toBeGreaterThan(20)
      for (const i of below) expect(bowing[i]!.distanceTo(standing[i]!)).toBeLessThan(1e-9)
      const forward = above.reduce((sum, i) => sum + bowing[i]!.z - standing[i]!.z, 0) / above.length
      expect(forward).toBeGreaterThan(0.05)
    }
  })

  it('poses the moving parts of a worn thing as the world says', () => {
    const still = dressed({ hand: { kind: 'wand', tint: null } })
    still.layer.update(still.world, 0)
    const spun = dressed({ hand: { kind: 'wand', tint: null } })
    spun.a.wornParts = { hand: { star: { ...restPart(), z: 0.3 } } }
    spun.layer.update(spun.world, 0)
    const [stick, star] = wornPieces(still.layer)
    const [stickToo, starMoved] = wornPieces(spun.layer)
    expect(stickToo!.distanceTo(stick!)).toBeLessThan(1e-9)
    // Facing the camera (+z), the star moves 0.3 m toward it.
    expect(starMoved!.z - star!.z).toBeCloseTo(0.3, 6)
  })
})
