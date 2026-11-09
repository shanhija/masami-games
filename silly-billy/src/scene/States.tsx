import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { ExtrudeGeometry, Group, InstancedMesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, OctahedronGeometry, Shape, Vector2, type BufferGeometry, type Material } from 'three'

import { bodyCenter, headFrame, proportions } from '../engine/body'
import { mixColor } from '../engine/sky'
import type { Actor, Effect, Look, World } from '../engine/types'
import { drop, star } from './Effects'
import { FACE_CAMERA, colorOf, type Clock } from './look'
import type { SceneSource } from './Stage'

/**
 * What a body's states look like (engine/effects.ts), besides the sway the sim puts in its
 * pose: the skin goes green when sick, red when hot and blue when cold, a glowing body lights
 * itself (both in the body's own look, `shownLook`); and over it, stars circling a dizzy head,
 * drips falling off a wet body, Z's floating up from a sleepy one, sweat flying off a hot one,
 * twinkles round a glowing one. All of them in a few instanced meshes, placed every frame from
 * the world on the scene's own clock.
 */

/** How a state tints the skin (or the fur), and how much. */
const TINTS: Partial<Record<Effect, [string, number]>> = { sick: ['#6fcf4f', 0.6], hot: ['#ff5a4a', 0.38], cold: ['#86b4ff', 0.45] }

const on = (a: Actor, e: Effect) => a.effects?.[e] !== undefined

/** The look the body is drawn in now: its own, with its skin tinted by sickness, heat or cold. */
export function shownLook(a: Actor): Look {
  if (a.effects === undefined) return a.look
  let skin = a.look.skin
  for (const e of ['sick', 'hot', 'cold'] as const) {
    const t = TINTS[e]!
    if (on(a, e)) skin = mixColor(colorOf(skin), t[0], t[1])
  }
  return skin === a.look.skin ? a.look : { ...a.look, skin }
}

/** Whether the body lights itself. */
export const glowing = (a: Actor) => on(a, 'glowing')

function zee(): BufferGeometry {
  const s = new Shape([[-0.5, 0.5], [0.5, 0.5], [0.5, 0.32], [-0.16, -0.32], [0.5, -0.32], [0.5, -0.5], [-0.5, -0.5], [-0.5, -0.32], [0.16, 0.32], [-0.5, 0.32]].map(([x, y]) => new Vector2(x, y)))
  return new ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: false }).translate(0, 0, -0.06)
}

/** As many of each mark as can show at once. */
const CAP = 96

interface Mark {
  mesh: InstancedMesh
  n: number
}

const scratch = new Object3D()
const frac = (v: number) => v - Math.floor(v)

export class StateLayer {
  readonly root = new Group()
  private readonly marks: Record<'star' | 'drop' | 'zee' | 'sweat' | 'twinkle', Mark>

  constructor() {
    const make = (geometry: BufferGeometry, material: Material): Mark => {
      const mesh = new InstancedMesh(geometry, material, CAP)
      mesh.count = 0
      mesh.frustumCulled = false
      this.root.add(mesh)
      return { mesh, n: 0 }
    }
    this.marks = {
      star: make(star(), new MeshBasicMaterial({ color: colorOf('#f5d33b') })),
      drop: make(drop(), new MeshStandardMaterial({ color: '#8fdcf5', roughness: 0.3, flatShading: true })),
      zee: make(zee(), new MeshBasicMaterial({ color: '#dfeeff' })),
      sweat: make(drop(), new MeshStandardMaterial({ color: '#c9f0ff', roughness: 0.2, flatShading: true })),
      twinkle: make(new OctahedronGeometry(0.5), new MeshBasicMaterial({ color: '#fff6c2' })),
    }
  }

  private put(kind: keyof StateLayer['marks'], x: number, y: number, z: number, size: number, face: boolean, spin: number) {
    const m = this.marks[kind]
    if (m.n >= CAP) return
    scratch.position.set(x, y, z)
    if (face) scratch.rotation.set(FACE_CAMERA[0], FACE_CAMERA[1], spin, FACE_CAMERA[3])
    else scratch.rotation.set(0, spin, 0, 'XYZ')
    scratch.scale.setScalar(size)
    scratch.updateMatrix()
    m.mesh.setMatrixAt(m.n++, scratch.matrix)
  }

  update(world: World, clock: number) {
    for (const m of Object.values(this.marks)) m.n = 0
    for (const a of world.actors) {
      if (a.effects === undefined) continue
      const pr = proportions(a.look)
      const s = a.scale
      const head = headFrame(a, pr).p
      const r = pr.headR * s
      const seed = (a.id.charCodeAt(0) % 7) / 7
      if (on(a, 'dizzy'))
        for (let i = 0; i < 4; i++) {
          const ang = clock * 3.2 + (i * Math.PI) / 2
          this.put('star', head[0] + Math.cos(ang) * r * 1.6, head[1] + r * 1.15 + 0.04 * Math.sin(clock * 6 + i), head[2] + Math.sin(ang) * r * 1.6, 0.16 * s, true, clock * 2 + i)
        }
      if (on(a, 'wet')) {
        const c = bodyCenter(a, pr)
        for (let i = 0; i < 3; i++) {
          const k = frac(clock * 1.2 + i / 3 + seed)
          const ang = i * 2.1 + seed * 6
          const out = pr.radius * s * 0.8
          this.put('drop', c[0] + Math.cos(ang) * out, c[1] - k * Math.max(0.2, c[1] - a.y), c[2] + Math.sin(ang) * out, 0.07 * s * (1 - 0.4 * k), false, 0)
        }
      }
      if (on(a, 'sleepy'))
        for (let i = 0; i < 2; i++) {
          const k = frac(clock * 0.45 + i / 2 + seed)
          this.put('zee', head[0] + (0.15 + 0.25 * k) * s, head[1] + r + 0.15 + 0.55 * k * s, head[2], (0.08 + 0.1 * k) * s, true, 0.3 * Math.sin(clock * 2 + i))
        }
      if (on(a, 'hot'))
        for (let i = 0; i < 2; i++) {
          const k = frac(clock * 1.5 + i / 2 + seed)
          const side = i === 0 ? 1 : -1
          const ang = a.yaw + side * Math.PI * 0.5
          this.put('sweat', head[0] + Math.sin(ang) * r * (1 + 1.2 * k), head[1] + r * 0.6 + 0.25 * k - 0.9 * k * k, head[2] + Math.cos(ang) * r * (1 + 1.2 * k), 0.06 * s, false, 0)
        }
      if (on(a, 'glowing')) {
        const c = bodyCenter(a, pr)
        for (let i = 0; i < 4; i++) {
          const ang = clock * 1.4 + i * 1.6 + seed * 6
          const tw = 0.5 + 0.5 * Math.sin(clock * 7 + i * 2)
          this.put('twinkle', c[0] + Math.cos(ang) * pr.radius * s * 1.6, c[1] + (i - 1.5) * 0.18 * s * pr.height, c[2] + Math.sin(ang) * pr.radius * s * 1.6, 0.07 * s * tw, false, clock * 3)
        }
      }
    }
    for (const m of Object.values(this.marks)) {
      m.mesh.count = m.n
      if (m.n > 0) m.mesh.instanceMatrix.needsUpdate = true
    }
  }

  dispose() {
    for (const m of Object.values(this.marks)) {
      m.mesh.geometry.dispose()
      m.mesh.dispose()
    }
  }
}

export function States({ source, clock }: { source: SceneSource; clock: Clock }) {
  const layer = useMemo(() => new StateLayer(), [])
  useEffect(() => () => layer.dispose(), [layer])
  useFrame(() => layer.update(source.world, clock.t))
  return <primitive object={layer.root} />
}
