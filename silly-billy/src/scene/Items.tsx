import { useFrame } from '@react-three/fiber'
import { useEffect } from 'react'
import { Group, InstancedMesh, MeshBasicMaterial, Object3D, OctahedronGeometry } from 'three'

import { apply } from '../engine/body'
import { nightOf, skyOf } from '../engine/sky'
import type { Vec3, World } from '../engine/types'
import { itemRotation } from '../engine/world'
import type { Lamp } from './daylight'
import { MODEL, palette, type Clock } from './look'
import { ModelView, type Models } from './recipeMesh'
import type { SceneSource } from './Stage'

/** How long a new thing takes to pop in. */
const POP = 0.45
/** Glints circling each draft, and how many drafts can have them at once. */
const GLINTS = 4
const MAX_DRAFTS = 24

/** A new thing's size as it pops in: from nothing, a little past full, and back. */
function popScale(age: number): number {
  if (age >= POP) return 1
  if (age <= 0) return 0.001
  const k = age / POP - 1
  return 1 + 2.7 * k * k * k + 1.7 * k * k
}

const scratch = new Object3D()

/**
 * Every thing in the room, each a drawn copy of its kind's model (with the shapes code added to
 * it) placed from the world every frame: where it is, how it is turned, how big, its parts as
 * the pose says and drawn as this thing says (hidden, painted, glowing, its lights off). A copy
 * is made when the thing appears, made again when its model changes (a draft becoming the
 * real thing, a coat of paint, shapes added), and dropped when it goes. Drafts breathe together,
 * see-through, with glints circling them while the real thing is being made. Things that give
 * light (their own, or lamps and fires at night) are listed for the scene's lamps.
 */
export class ItemLayer {
  readonly root = new Group()
  /** The light things give this frame. */
  readonly lamps: Lamp[] = []
  private readonly views = new Map<string, { view: ModelView; seen: number }>()
  private readonly glints = new InstancedMesh(new OctahedronGeometry(0.11), new MeshBasicMaterial({ color: palette.glint }), GLINTS * MAX_DRAFTS)
  private tick = 0

  constructor(private readonly models: Models) {
    this.glints.frustumCulled = false
    this.glints.count = 0
    this.root.add(this.glints)
  }

  update(world: World, clock: number) {
    const tick = ++this.tick
    const breathe = Math.sin(clock * 4)
    const night = nightOf(skyOf(world).time)
    this.lamps.length = 0
    let glints = 0
    for (const item of world.items) {
      const model = this.models.get(item.kind, item.tint, null, item.added ?? null)
      let entry = this.views.get(item.id)
      if (entry === undefined || entry.view.model !== model) {
        if (entry !== undefined) this.root.remove(entry.view.root)
        entry = { view: new ModelView(model), seen: tick }
        this.root.add(entry.view.root)
        this.views.set(item.id, entry)
      }
      entry.seen = tick
      const size = item.scale * popScale(world.t - item.born)
      const r = entry.view.root
      r.position.set(item.x, item.y, item.z)
      r.rotation.set(item.pitch, item.yaw, -item.roll, 'YXZ')
      r.scale.setScalar(size * (model.rough ? 1 + 0.035 * breathe : 1))
      const glow = item.glow ?? null
      const glowColor = item.glowColor ?? null
      entry.view.pose(item.parts, { glow, glowColor })
      // Its own light shines day and night; a lamp or a fire that is on, at night.
      const light = item.light ?? null
      const lit = model.lights !== null && glow !== false && night > 0.02 && !model.rough
      if (light !== null || lit) {
        const { min, max } = model.recipe.bounds
        const at: Vec3 = light !== null ? [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2] : model.lights!.at
        const o = apply(itemRotation(item), at)
        const p = { x: item.x + o[0] * item.scale, y: item.y + o[1] * item.scale, z: item.z + o[2] * item.scale }
        if (light !== null) this.lamps.push({ ...p, color: light, strength: 0.6 + 0.4 * night })
        else this.lamps.push({ ...p, color: glowColor ?? model.lights!.color, strength: night * Math.min(1, 0.5 + model.lights!.size * item.scale) })
      }
      if (!model.rough || glints >= GLINTS * MAX_DRAFTS) continue
      const { min, max } = model.recipe.bounds
      const reach = (Math.max(max[0] - min[0], max[2] - min[2]) / 2 + 0.2) * size
      for (let i = 0; i < GLINTS; i++) {
        const a = clock * 2.2 + (i / GLINTS) * Math.PI * 2
        scratch.position.set(item.x + Math.cos(a) * reach, item.y + (min[1] + (max[1] - min[1]) * (0.3 + 0.5 * ((i * 0.37) % 1)) + 0.15 * Math.sin(clock * 3 + i)) * size, item.z + Math.sin(a) * reach)
        scratch.rotation.set(0, clock * 4 + i, 0)
        scratch.scale.setScalar(0.7 + 0.5 * Math.abs(Math.sin(clock * 5 + i * 1.7)))
        scratch.updateMatrix()
        this.glints.setMatrixAt(glints++, scratch.matrix)
      }
    }
    for (const [id, entry] of this.views) {
      if (entry.seen === tick) continue
      this.root.remove(entry.view.root)
      this.views.delete(id)
    }
    this.glints.count = glints
    this.glints.instanceMatrix.needsUpdate = true
    this.models.sweep()
    MODEL.draftSolid.opacity = MODEL.draftGlow.opacity = 0.72 + 0.14 * breathe
    MODEL.draftSolid.emissiveIntensity = 0.18 + 0.14 * breathe
  }

  dispose() {
    this.glints.geometry.dispose()
    this.glints.dispose()
  }
}

export function Items({ layer, source, clock }: { layer: ItemLayer; source: SceneSource; clock: Clock }) {
  useEffect(() => () => layer.dispose(), [layer])
  useFrame(() => layer.update(source.world, clock.t))
  return <primitive object={layer.root} />
}
