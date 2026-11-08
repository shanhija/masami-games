import { Box3, Color, SRGBColorSpace, Triangle, Vector3, type BufferGeometry } from 'three'
import { describe, expect, it } from 'vitest'

import { mulberry32 } from '../../../castle-builder/src/game/random'
import { buildRecipe, type Kit } from '../engine/kit'
import { itemPoint } from '../engine/world'
import { restPart, type Item, type ItemInfo, type PartPose, type Recipe } from '../engine/types'
import { MODEL } from './look'
import { buildModel, Models, ModelView, shapeColors } from './recipeMesh'

/** A thing made of every kind of shape, with a part inside a part and a glowing lamp. */
const everything = (m: Kit) => {
  m.box(1, 0.2, 0.6, { at: [0, 0.1, 0], color: '#e8503f' })
  m.sphere(0.2, { at: [0.6, 0.4, 0], scale: [1, 1.5, 1], color: 'blue' })
  m.cylinder(0.1, 0.2, 0.5, { at: [-0.6, 0.25, 0], color: '#5ec25a' })
  m.capsule(0.08, 0.3, { at: [0, 0.6, 0.4], rot: [0, 0, Math.PI / 2], color: '#f5d33b' })
  m.lathe([[0, 0], [0.2, 0.1], [0.15, 0.3], [0, 0.35]], { at: [0, 0.2, -0.4], color: '#9b5fd3' })
  m.extrude([[0, 0], [0.3, 0], [0.15, 0.3]], 0.05, { at: [0.3, 0.2, 0.3], color: '#fbf8f2' })
  m.tube([[0, 0, 0], [0.2, 0.3, 0], [0.4, 0.2, 0.1]], 0.03, { at: [-0.3, 0.3, 0.3], color: '#2b2b30' })
  m.part('arm', { at: [0, 0.3, 0], rot: [0, 0.4, 0] }, () => {
    m.box(0.8, 0.05, 0.05, { at: [0.4, 0, 0], color: '#8a5a34' })
    m.part('wheel', { at: [0.8, 0, 0] }, () => {
      m.torus(0.15, 0.04, { rot: [0, Math.PI / 2, 0], color: '#2b2b30' })
      m.sphere(0.06, { color: '#fff3a0', glow: true })
    })
  })
  return { carry: 'hug' }
}

const triangles = (g: BufferGeometry) => g.getAttribute('position').count / 3

const restItem = (): Item => ({ id: '#i1', kind: 'crane', x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1, vx: 0, vy: 0, vz: 0, spin: 0, loose: false, holder: null, rider: null, parts: {}, state: {}, tint: null, born: 0, fixed: false })

describe('a recipe as three.js', () => {
  it('merges each part into one solid geometry and one glowing one, every vertex coloured', () => {
    const { recipe } = buildRecipe(everything)
    const model = buildModel(recipe, false, null, null)
    expect([...model.parts.keys()].sort()).toEqual([null, 'arm', 'wheel'].sort())
    const own = model.parts.get(null)!
    expect(own.glow).toBeNull()
    expect(model.parts.get('wheel')!.glow).not.toBeNull()
    for (const p of model.parts.values()) {
      for (const g of [p.solid, p.glow]) {
        if (g === null) continue
        expect(g.index).toBeNull()
        expect(g.getAttribute('color').count).toBe(g.getAttribute('position').count)
        expect(Number.isInteger(triangles(g))).toBe(true)
      }
    }
    // The red box's corners are red.
    const red = new Color('#e8503f')
    const colors = own.solid!.getAttribute('color')
    expect([colors.getX(0), colors.getY(0), colors.getZ(0)]).toEqual([red.r, red.g, red.b].map((v) => Math.fround(v)))
  })

  it('stands where the kit measured it: the drawn model fills the recipe bounds', () => {
    const { recipe } = buildRecipe(everything)
    const view = new ModelView(buildModel(recipe, false, null, null))
    view.pose({})
    view.root.updateMatrixWorld(true)
    const box = new Box3().setFromObject(view.root)
    const { min, max } = recipe.bounds
    for (let k = 0; k < 3; k++) {
      // The kit measures each shape's own box turned, so it is never smaller than the shapes.
      expect(box.min.getComponent(k)).toBeGreaterThanOrEqual(min[k]! - 1e-6)
      expect(box.max.getComponent(k)).toBeLessThanOrEqual(max[k]! + 1e-6)
      expect(box.max.getComponent(k) - box.min.getComponent(k)).toBeGreaterThan((max[k]! - min[k]!) * 0.85)
    }
  })

  it('moves a part from its pivot as the pose says, and its child parts with it', () => {
    const { recipe } = buildRecipe((m) => {
      m.box(0.2, 0.2, 0.2, { at: [0, 0.1, 0] })
      m.part('lid', { at: [0, 1, 0] }, () => {
        m.box(0.1, 0.1, 0.1, { at: [0.5, 0, 0], color: '#e8503f' })
        m.part('knob', { at: [0.5, 0.2, 0] }, () => m.sphere(0.05, { color: '#2b2b30' }))
      })
    })
    const view = new ModelView(buildModel(recipe, false, null, null))
    const centre = (part: number) => {
      view.root.updateMatrixWorld(true)
      return new Box3().setFromObject(view.meshes[part]!).getCenter(new Vector3())
    }
    view.pose({})
    expect(centre(1).distanceTo(new Vector3(0.5, 1, 0))).toBeLessThan(1e-6)
    view.pose({ lid: { ...restPart(), y: 0.5, rz: Math.PI / 2 } })
    expect(centre(1).distanceTo(new Vector3(0, 2, 0))).toBeLessThan(1e-6)
    // The knob rides on the lid: (0.5, 0.2) from its pivot, turned a quarter.
    expect(centre(2).distanceTo(new Vector3(-0.2, 2, 0))).toBeLessThan(1e-6)
  })

  it('draws posed parts where the engine reckons them, however their pivots are turned', () => {
    const { recipe } = buildRecipe((m) => {
      m.box(0.4, 0.4, 0.4, { at: [0, 0.2, 0] })
      m.part('arm', { at: [0, 0.3, 0.1], rot: [0.2, 0.4, -0.3] }, () => {
        m.box(0.8, 0.05, 0.05, { at: [0.4, 0, 0] })
        m.part('hand', { at: [0.8, 0, 0], rot: [0.5, 0, 0.7] }, () => {
          m.sphere(0.06, { color: '#e8503f' })
          m.anchor('tip', [0.1, 0.2, -0.05])
        })
      })
    })
    const info: ItemInfo = { kind: 'crane', name: 'crane', nameFi: 'nosturi', recipe, size: [1, 1, 1], radius: 0.5, rough: false }
    const model = buildModel(recipe, false, null, null)
    const view = new ModelView(model)
    const rand = mulberry32(12)
    const r = () => rand() * 4 - 2
    for (let n = 0; n < 20; n++) {
      const it = { x: r() * 3, y: r(), z: r() * 3, yaw: r(), pitch: r() / 2, roll: r() / 2, scale: 0.5 + rand(), parts: {} as Record<string, PartPose> }
      for (const name of ['arm', 'hand']) if (rand() < 0.8) it.parts[name] = { x: r() / 4, y: r() / 4, z: r() / 4, rx: r(), ry: r(), rz: r(), s: 0.5 + rand() }
      view.root.position.set(it.x, it.y, it.z)
      view.root.rotation.set(it.pitch, it.yaw, -it.roll, 'YXZ')
      view.root.scale.setScalar(it.scale)
      view.pose(it.parts)
      view.root.updateMatrixWorld(true)
      const hand = view.meshes.find((m) => m.geometry === model.parts.get('hand')!.solid)!.parent!
      const drawn = new Vector3(...recipe.anchors.tip!.at).applyMatrix4(hand.matrixWorld)
      const engine = itemPoint({ ...restItem(), ...it }, info, 'hand', recipe.anchors.tip!.at)
      expect(drawn.distanceTo(new Vector3(...engine))).toBeLessThan(1e-9)
    }
  })

  it('draws a tube that goes nowhere as a ball, not as nothing', () => {
    const { recipe } = buildRecipe((m) => m.tube([[0, 0.2, 0], [0, 0.2, 0]], 0.05))
    const g = buildModel(recipe, false, null, null).parts.get(null)!.solid!
    g.computeBoundingSphere()
    expect(g.boundingSphere!.radius).toBeCloseTo(0.05, 5)
  })

  it('keeps a mirrored shape facing out', () => {
    const { recipe } = buildRecipe((m) => m.extrude([[0, 0], [1, 0], [0, 1]], 0.2, { scale: [-1, 1, 1] }))
    const g = buildModel(recipe, false, null, null).parts.get(null)!.solid!
    const pos = g.getAttribute('position')
    const nrm = g.getAttribute('normal')
    const t = new Triangle()
    const facing = new Vector3()
    let agree = 0
    for (let i = 0; i < pos.count; i += 3) {
      t.setFromAttributeAndIndices(pos, i, i + 1, i + 2).getNormal(facing)
      if (facing.dot(new Vector3(nrm.getX(i), nrm.getY(i), nrm.getZ(i))) > 0) agree++
    }
    expect(agree).toBe(pos.count / 3)
  })

  it('faces a lathe outward whichever way its points run, and a flat one up toward the camera', () => {
    /** Of the triangles with an area, how many face the way `away` says by their corners' order, and how many agree with their own normals. */
    const facing = (g: BufferGeometry, away: (centre: Vector3) => Vector3) => {
      const pos = g.getAttribute('position')
      const nrm = g.getAttribute('normal')
      const t = new Triangle()
      const n = new Vector3()
      const centre = new Vector3()
      let faces = 0
      let out = 0
      let agree = 0
      for (let i = 0; i < pos.count; i += 3) {
        t.setFromAttributeAndIndices(pos, i, i + 1, i + 2)
        if (t.getArea() < 1e-9) continue
        faces++
        t.getNormal(n)
        t.getMidpoint(centre)
        if (n.dot(away(centre)) > 0) out++
        if (n.dot(new Vector3(nrm.getX(i), nrm.getY(i), nrm.getZ(i))) > 0) agree++
      }
      return { faces, out, agree }
    }
    // A tree crown, its points bottom to top and top to bottom: both a dome seen from outside.
    const up = [
      [0, 0.6],
      [1.2, 0.8],
      [1, 1.8],
      [0.5, 2.8],
      [0, 3.4],
    ]
    for (const points of [up, [...up].reverse()]) {
      const { recipe } = buildRecipe((m) => m.lathe(points, { color: '#3cb043' }))
      const g = buildModel(recipe, false, null, null).parts.get(null)!.solid!
      const { out, agree, faces } = facing(g, (c) => c.clone().sub(new Vector3(0, 1.8, 0)))
      expect(out).toBe(faces)
      expect(agree).toBe(faces)
    }
    // A flat disc, written from the middle out or from the rim in: seen from above.
    for (const points of [
      [
        [0, 0.5],
        [1, 0.5],
      ],
      [
        [1, 0.5],
        [0, 0.5],
      ],
    ]) {
      const g = buildModel(buildRecipe((m) => m.lathe(points)).recipe, false, null, null).parts.get(null)!.solid!
      const { out, faces } = facing(g, () => new Vector3(0, 1, 0))
      expect(out).toBe(faces)
    }
  })

  it('cuts a worn body thing at the model kid’s hips, each half keeping the colours of the whole', () => {
    // lib1's gown: a skirt to the waist, a bodice to the shoulders, a sash, a jewel and two straps.
    const { recipe } = buildRecipe((m) => {
      m.lathe([[0.36, 0.03], [0.34, 0.1], [0.27, 0.3], [0.19, 0.45], [0.15, 0.5], [0, 0.5]], { color: '#f7a8c8' })
      m.lathe([[0.15, 0.48], [0.14, 0.56], [0.16, 0.66], [0.15, 0.69], [0, 0.69]], { color: '#f7a8c8' })
      m.torus(0.15, 0.022, { at: [0, 0.5, 0], rot: [Math.PI / 2, 0, 0], color: '#e4789f' })
      m.sphere(0.04, { at: [0, 0.52, 0.15], color: '#ffffff' })
      for (const x of [-0.11, 0.11]) m.capsule(0.02, 0.1, { at: [x, 0.71, 0], color: '#e4789f' })
      return { carry: 'hand', wear: 'body' }
    })
    const whole = buildModel(recipe, false, 'blue', null).parts.get(null)!.solid!
    const upper = buildModel(recipe, false, 'blue', 'upper').parts.get(null)!.solid!
    const lower = buildModel(recipe, false, 'blue', 'lower').parts.get(null)!.solid!
    const box = (g: BufferGeometry) => (g.computeBoundingBox(), g.boundingBox!)
    // The skirt up to the hips below; above them the top of the skirt, the bodice, the sash, the jewel and the straps.
    expect(box(lower).min.y).toBeCloseTo(box(whole).min.y, 5)
    expect(box(lower).max.y).toBeCloseTo(0.4, 5)
    expect(box(upper).min.y).toBeCloseTo(0.4, 5)
    expect(box(upper).max.y).toBeCloseTo(box(whole).max.y, 5)
    // The skirt comes first in the whole, so its colours are the whole's first ones.
    const colours = (g: BufferGeometry, n: number) => Array.from(g.getAttribute('color').array.slice(0, n * 3))
    expect(colours(lower, 50)).toEqual(colours(whole, 50))
  })

  it('cuts a gown drawn as one lathe from hem to neckline at the hips, its two halves meeting there', () => {
    /** The radius of a geometry's points at height y, or -1 where it has none. */
    const ringAt = (g: BufferGeometry, y: number) => {
      const pos = g.getAttribute('position')
      let r = -1
      for (let i = 0; i < pos.count; i++) if (Math.abs(pos.getY(i) - y) < 1e-6) r = Math.max(r, Math.hypot(pos.getX(i), pos.getZ(i)))
      return r
    }
    const box = (g: BufferGeometry) => (g.computeBoundingBox(), g.boundingBox!)
    const gowns = [
      // From Opus tonight: a skirt flaring from 0.28 up to a neckline at 0.72.
      (m: Kit) => m.lathe([[0.3, 0.28], [0.27, 0.34], [0.17, 0.42], [0.14, 0.5], [0.16, 0.6], [0.17, 0.67], [0.1, 0.71], [0.08, 0.72]], { color: '#f7a1c4' }),
      // Floor-length, written top to bottom.
      (m: Kit) => m.lathe([[0, 0.69], [0.12, 0.69], [0.16, 0.62], [0.15, 0.5], [0.2, 0.4], [0.3, 0.2], [0.34, 0.03]], { color: '#7fb3ff' }),
      // Drawn upside down and turned over into place, one point right at the hips.
      (m: Kit) => m.lathe([[0.34, 0.66], [0.2, 0.3], [0.15, 0.2], [0.12, 0]], { at: [0, 0.7, 0], rot: [Math.PI, 0, 0] }),
    ]
    for (const draw of gowns) {
      const { recipe } = buildRecipe(draw)
      const lower = buildModel(recipe, false, null, 'lower').parts.get(null)!.solid!
      const upper = buildModel(recipe, false, null, 'upper').parts.get(null)!.solid!
      expect(box(lower).max.y).toBeCloseTo(0.4, 5)
      expect(box(upper).min.y).toBeCloseTo(0.4, 5)
      expect(ringAt(lower, 0.4)).toBeGreaterThan(0.1)
      expect(ringAt(upper, 0.4)).toBeCloseTo(ringAt(lower, 0.4), 6)
    }
    // Tilted, it goes whole to one half, as any other shape.
    const { recipe } = buildRecipe((m) => m.lathe([[0.3, 0.1], [0.1, 0.7]], { rot: [0.5, 0, 0] }))
    expect(buildModel(recipe, false, null, 'upper').parts.size + buildModel(recipe, false, null, 'lower').parts.size).toBe(1)
  })

  it('paints a tinted thing in the tint, keeping its dark parts darker', () => {
    const { recipe } = buildRecipe((m) => {
      m.box(1, 1, 1, { color: '#2b2b30' })
      m.box(1, 1, 1, { color: '#f5d33b' })
    })
    const [dark, light] = shapeColors(recipe.shapes, 'pink').map((c) => c.getHSL({ h: 0, s: 0, l: 0 }, SRGBColorSpace))
    const pink = new Color('#ff9ccf').getHSL({ h: 0, s: 0, l: 0 }, SRGBColorSpace)
    expect(dark!.h).toBeCloseTo(pink.h, 5)
    expect(light!.h).toBeCloseTo(pink.h, 5)
    expect(dark!.l).toBeLessThan(light!.l)
  })

  it('draws a draft see-through, its solid shapes still casting their shadow', () => {
    const { recipe } = buildRecipe(everything)
    const view = new ModelView(buildModel(recipe, true, null, null))
    for (const mesh of view.meshes) {
      expect([MODEL.draftSolid, MODEL.draftGlow]).toContain(mesh.material)
      expect(mesh.castShadow).toBe(mesh.material === MODEL.draftSolid)
    }
  })
})

describe('the models', () => {
  function library(recipe: Recipe) {
    const source = { libraryVersion: 1, info: (kind: string): ItemInfo => ({ kind, name: kind, nameFi: kind, recipe: source.recipe, size: [1, 1, 1], radius: 0.5, rough: false }), recipe }
    return source
  }

  it('keeps a model until its recipe changes, and lets the old one go', () => {
    const source = library(buildRecipe(everything).recipe)
    const models = new Models(source)
    const first = models.get('thing', null, null)
    expect(models.get('thing', null, null)).toBe(first)
    expect(models.get('thing', 'red', null)).not.toBe(first)
    source.libraryVersion++
    expect(models.get('thing', null, null)).toBe(first)
    let dropped = 0
    first.parts.get(null)!.solid!.addEventListener('dispose', () => dropped++)
    source.recipe = buildRecipe((m) => m.sphere(0.3)).recipe
    expect(models.get('thing', null, null)).toBe(first)
    source.libraryVersion++
    const second = models.get('thing', null, null)
    expect(second).not.toBe(first)
    expect(second.recipe).toBe(source.recipe)
    expect(dropped).toBe(1)
  })

  it('lets go of a model nothing has drawn for ten seconds, and keeps the ones in use', () => {
    const source = library(buildRecipe(everything).recipe)
    const models = new Models(source)
    const pink = models.get('thing', 'pink', null)
    const plain = models.get('thing', null, null)
    let dropped = 0
    pink.parts.get(null)!.solid!.addEventListener('dispose', () => dropped++)
    plain.parts.get(null)!.solid!.addEventListener('dispose', () => dropped++)
    for (let frame = 0; frame < 900; frame++) {
      models.get('thing', null, null)
      models.sweep()
    }
    expect(dropped).toBe(1)
    expect(models.get('thing', null, null)).toBe(plain)
    expect(models.get('thing', 'pink', null)).not.toBe(pink)
  })

  it('keeps only the newest few tints of a thing its process paints a new colour every frame, and never lets go of one still drawn', () => {
    const source = library(buildRecipe(everything).recipe)
    const models = new Models(source)
    // Six copies in six colours stay in the room all along.
    const paints = ['red', 'blue', 'green', 'yellow', 'pink', 'purple']
    const kept = paints.map((p) => models.get('thing', p, null))
    let built = 0
    let dropped = 0
    for (let frame = 0; frame < 120; frame++) {
      // A rainbow wand.
      const model = models.get('thing', `hsl(${frame * 3}, 80%, 60%)`, null)
      built++
      model.parts.get(null)!.solid!.addEventListener('dispose', () => dropped++)
      paints.forEach((p, i) => expect(models.get('thing', p, null)).toBe(kept[i]))
      models.sweep()
    }
    expect(built - dropped).toBeLessThanOrEqual(4)
  })
})
