import { describe, expect, it, vi } from 'vitest'
import { Mesh, PerspectiveCamera, Scene, type Vector4, type WebGLRenderer } from 'three'

import { DRIVER_SPECIES, FRIEND_OF, HAT_COLOURS, RANKS } from '../game/model'

const baked = vi.hoisted(() => ({ calls: 0 }))
vi.mock('./parts', async (original) => {
  const parts = await original<typeof import('./parts')>()
  return {
    ...parts,
    bake: (...args: Parameters<typeof parts.bake>) => {
      baked.calls++
      return parts.bake(...args)
    },
  }
})

const { creature, warmDrivers } = await import('./creatures')
const { uploadAll } = await import('./preload')

describe('creatures', () => {
  it('warmDrivers makes every driver shape, and asking for one afterwards bakes nothing', () => {
    warmDrivers()
    const after = baked.calls
    expect(after).toBeGreaterThan(0)
    const golden = RANKS[RANKS.length - 1].hat
    for (const species of DRIVER_SPECIES) for (const hat of [...HAT_COLOURS, golden]) creature(species, hat, true)
    for (const species of Object.values(FRIEND_OF)) creature(species, HAT_COLOURS[HAT_COLOURS.length - 1], true)
    expect(baked.calls).toBe(after)
    warmDrivers()
    expect(baked.calls).toBe(after)
  })

  it('registers the body and legs it makes as spares, so the upload sends them', () => {
    const made = creature('pig', '#123456', true)
    const sent = new Set<unknown>()
    const gl = { getScissorTest: () => false, setScissorTest: () => {}, getScissor: (v: Vector4) => v, setScissor: () => {}, render: (scene: Scene) => scene.traverse((o) => o instanceof Mesh && sent.add(o.geometry)) }
    uploadAll(gl as unknown as WebGLRenderer, new Scene(), new PerspectiveCamera())
    expect(sent.has(made.body)).toBe(true)
    expect(sent.has(made.legs[0])).toBe(true)
  })
})
