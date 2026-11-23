/**
 * The room's halos (RoomView.ts GlowHalos): in a dim room every player has one in their seat's
 * colour, and whatever a player can use that glows not has a faint warm one (step 7a, Light: dim
 * rooms are helped by rule); in a bright room neither. The way out's halo is always one of them.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { HandleId, Mover } from '../engine/world'
import { fixture } from './fixtures'
import { RoomModels } from './models'
import { GlowHalos } from './RoomView'

/** How many halos the room's glow halos draw for `world`. */
function halos(world: ReturnType<typeof fixture>['world']): number {
  const g = new GlowHalos(world.solids.length + world.things.length + world.decor.length + world.players.length, world.view === 'high')
  g.update(world, new Map<HandleId, Mover>(world.movers.map((m) => [m.id, m])), new RoomModels(world.models), () => 0, { at: [0, 1.1, -2.8], size: 3.2, color: '#fffbe0', bright: 0.5 }, 0)
  const n = g.mesh.count
  g.dispose()
  return n
}

describe("a dim room's halos", () => {
  // The halo's texture is drawn on a canvas: one that draws nothing is enough here.
  const nothing: unknown = new Proxy(() => nothing, { get: () => nothing, apply: () => nothing, set: () => true })
  afterEach(() => vi.unstubAllGlobals())

  it('give every player a halo and what a player can use a faint one in a dim room, and neither in a bright one', () => {
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => nothing }) })
    const night = fixture('night').world
    const usable = night.solids.find((s) => !s.house && s.glow === null && !s.hidden)!
    const plain = halos({ ...night, uses: [] })
    expect(halos({ ...night, uses: [usable.id] })).toBe(plain + 1)
    const meadow = fixture('meadow').world
    const bright = meadow.solids.find((s) => !s.house && s.glow === null && !s.hidden)!
    expect(halos({ ...meadow, uses: [bright.id] })).toBe(halos({ ...meadow, uses: [] }))
    expect(plain).toBeGreaterThanOrEqual(night.players.length)
    expect(halos({ ...meadow, uses: [] })).toBeLessThan(halos({ ...meadow, shell: { ...meadow.shell, light: 0.6 }, uses: [] }))
  })
})
