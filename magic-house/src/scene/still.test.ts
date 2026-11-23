import { describe, expect, it } from 'vitest'

import { ROOM_PATTERNED } from '../patterns/look'
import { fixture } from './fixtures'
import { RoomModels } from './models'
import { DIM_TOP, solidGeometry } from './shapes'
import { Batch, SHELL_PIECE, solidKey, stillDecor, stillPieces, stillSolid } from './still'

describe('the still parts of a room', () => {
  it('are the solids and decor nothing has moved, lit up or posed, each in the frame it was built in', () => {
    const { world } = fixture('workshop')
    const pieces = stillPieces(world, new RoomModels(world.models), true, new Map())
    const ids = (frame: number | null) => (pieces.get(frame) ?? []).map((p) => p.id)
    const room = ids(null)
    const [lift, wheel] = world.movers
    // The room's own still solids are in its batch, the glowing one, the posed gears and the house's own solids are not; the house round the room comes first.
    expect(room[0]).toBe(SHELL_PIECE)
    expect(stillPieces(world, new RoomModels(world.models), false, new Map()).get(null)!.map((p) => p.id)).toEqual(room.slice(1))
    for (const s of world.solids.filter((s) => s.mover === null)) expect(room.includes(s.id)).toBe(s.glow === null && !s.house)
    expect(world.solids.filter((s) => s.house)).toHaveLength(4)
    for (const d of world.decor) expect(room.includes(d.id)).toBe(false)
    // A mover's solids go in a batch of its own, in its frame.
    expect(ids(lift!.id)).toEqual(world.solids.filter((s) => s.mover === lift!.id).map((s) => s.id))
    expect(ids(wheel!.id)).toHaveLength(3)
    expect(stillSolid({ ...world.solids[0]!, hidden: true })).toBe(false)
    expect(stillSolid({ ...world.solids[0]!, turning: { from: 0, to: 1, start: 0, secs: 1 } })).toBe(false)
    expect(stillDecor({ ...world.decor[0]!, changed: false })).toBe(true)
    expect(stillDecor({ ...world.decor[0]!, changed: false, glow: { color: '#fff', pulse: true } })).toBe(false)
  })

  it('merge into one lit mesh and one glowing one, whatever their number', () => {
    const { world } = fixture('meadow')
    const pieces = stillPieces(world, new RoomModels(world.models), true, new Map()).get(null)!
    const corners = (which: 'solid' | 'glow') => pieces.reduce((n, p) => n + (p[which]?.getAttribute('position').count ?? 0), 0)
    const [solid, glow] = [corners('solid'), corners('glow')]
    expect(pieces.length).toBeGreaterThan(20)
    const shell = pieces[0]!.solid!.getAttribute('position').count
    const batch = new Batch(pieces)
    expect(batch.root.children).toHaveLength(glow > 0 ? 2 : 1)
    expect(batch.meshes.solid!.geometry.getAttribute('position').count).toBe(solid)
    expect(batch.size).toBe(pieces.length)
    // In the patterned material, every lit vertex carrying a pattern: the shell's its paint's, every other none.
    expect(batch.meshes.solid!.material).toBe(ROOM_PATTERNED)
    const pattern = batch.meshes.solid!.geometry.getAttribute('pattern')
    expect(pattern.count).toBe(solid)
    const kinds = new Set<number>()
    for (let i = 0; i < pattern.count; i++) kinds.add(pattern.getW(i))
    expect(kinds.has(0)).toBe(true)
    expect([...kinds].some((k) => k > 0)).toBe(true)
    for (let i = shell; i < pattern.count; i++) expect(pattern.getW(i)).toBe(0)
  })

  it('in a dim room draw the tops of plain solids a little lighter, their sides as they were', () => {
    const s = fixture('meadow').world.solids[1]!
    const colors = (dim: boolean) => solidGeometry(s.shape, s.surface, 'side', dim).getAttribute('color').array as Float32Array
    const [bright, dim] = [colors(false), colors(true)]
    let lighter = 0
    for (let i = 0; i < bright.length; i++) {
      expect(dim[i]!).toBeGreaterThanOrEqual(bright[i]! - 1e-6)
      if (dim[i]! > bright[i]! + 1e-6) lighter++
    }
    expect(lighter).toBeGreaterThan(0)
    expect(lighter).toBeLessThan(bright.length / 2)
    expect(DIM_TOP).toBe(0.1)
  })

  it('take a piece out by folding its corners to a point, and leave the rest where they were', () => {
    const { world } = fixture('small')
    const pieces = stillPieces(world, new RoomModels(world.models), true, new Map()).get(null)!
    const counts = pieces.map((p) => p.solid!.getAttribute('position').count)
    const batch = new Batch(pieces)
    const pos = batch.meshes.solid!.geometry.getAttribute('position')
    const before = Array.from(pos.array as Float32Array)
    const second = pieces[1]!.id
    batch.takeOut(second)
    const after = Array.from(pos.array as Float32Array)
    const start = counts[0]! * 3
    const end = start + counts[1]! * 3
    expect(after.slice(start, end).every((v) => v === 0)).toBe(true)
    expect(after.slice(0, start)).toEqual(before.slice(0, start))
    expect(after.slice(end)).toEqual(before.slice(end))
    expect(batch.has(second)).toBe(false)
    expect(() => batch.takeOut(second)).toThrow(/not in this batch/)
  })

  it('watch a solid by its key: moving, turning, recolouring or hiding it changes the key', () => {
    const s = fixture('meadow').world.solids[1]!
    const key = solidKey(s)
    expect(solidKey({ ...s })).toBe(key)
    expect(solidKey({ ...s, at: [s.at[0] + 0.01, s.at[1], s.at[2]] })).not.toBe(key)
    expect(solidKey({ ...s, turn: 0.1 })).not.toBe(key)
    expect(solidKey({ ...s, hidden: true })).not.toBe(key)
    expect(solidKey({ ...s, surface: { ...s.surface, color: '#000000' } })).not.toBe(key)
    expect(solidKey({ ...s, glow: { color: '#ffffff', pulse: false } })).not.toBe(key)
  })
})
