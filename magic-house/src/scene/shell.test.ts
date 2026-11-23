import { Box3, Color } from 'three'
import { describe, expect, it } from 'vitest'

import { colorOf } from '../../../silly-billy/src/scene/look'
import { LAMPS_LIT, LIGHT_RANGE, ROOM, SHELL_REF, type Paint, type Shell } from '../engine/api'
import { HIGH_FRAME, SIDE_FRAME } from '../engine/camera'
import { HOUSE_SHELL, ROOM_BOUNDS, type Lamp } from '../engine/world'
import { patternNumber } from '../patterns/look'
import { doorPlace } from './Door'
import { fixture, FIXTURES } from './fixtures'
import { lampsLit, LIGHT, shellLight, shineIn } from './RoomView'
import { MOTIF, wallpaperSpots } from '../engine/look'
import { calmSecond, HOUSE_LOOK, paintDistance, SHELL_CALM, shellGeometry } from './shell'

const NIGHT = { ...HOUSE_SHELL, walls: { color: '#1b2552', second: '#ffe9a0', pattern: 'stars' as const }, light: 0.6 }

describe('the house round a room (scene/shell.ts)', () => {
  it('is one geometry with position, normal, colour and pattern on every vertex, ready for the still batch', () => {
    for (const view of ['side', 'high'] as const) {
      const g = shellGeometry(HOUSE_SHELL, view)
      expect(Object.keys(g.attributes).sort()).toEqual(['color', 'normal', 'pattern', 'position'])
      expect(g.index).toBeNull()
      const n = g.getAttribute('position').count
      expect(n % 6).toBe(0)
      for (const name of ['normal', 'color', 'pattern']) expect(g.getAttribute(name).count).toBe(n)
    }
  })

  it("paints the back wall in the walls' colour carrying their pattern in their second colour, laid softly", () => {
    const g = shellGeometry(NIGHT, 'side')
    const [pos, nor, col, pat] = ['position', 'normal', 'color', 'pattern'].map((a) => g.getAttribute(a))
    const wall = new Color(colorOf(NIGHT.walls.color))
    const second = calmSecond(wall, new Color(colorOf(NIGHT.walls.second)))
    let found = 0
    for (let i = 0; i < pos.count; i++) {
      if (Math.abs(pos!.getZ(i) - ROOM.side.back) > 1e-6 || nor!.getZ(i) < 0.99) continue
      found++
      expect([col!.getX(i), col!.getY(i), col!.getZ(i)]).toEqual([wall.r, wall.g, wall.b].map((v) => expect.closeTo(v, 6)))
      expect([pat!.getX(i), pat!.getY(i), pat!.getZ(i), pat!.getW(i)]).toEqual([second.r, second.g, second.b, patternNumber('stars')].map((v) => expect.closeTo(v, 6)))
    }
    expect(found).toBe(6)
  })

  it('lays the shell\'s patterns softly, as SHELL_REF says: a far second colour is drawn toward the first until they stand SHELL_CALM.most apart, a near one as given', () => {
    expect(SHELL_REF.walls).toContain('laid in second over color all over them, softly: where second stands far from color the house draws it nearer to color, so the walls stay a calm background to the play in any light')
    expect(SHELL_REF.floor).toContain("as the walls' and as softly")
    expect(SHELL_REF.ceiling).toContain("as the walls' and as softly")
    const loud = (color: string, second: string, pattern: Paint['pattern']): Paint => ({ color, second, pattern })
    const shells: Shell[] = [
      NIGHT,
      { ...HOUSE_SHELL, walls: loud('#ff0000', '#00ff00', 'checks'), floor: loud('#000000', '#ffffff', 'stripes'), ceiling: loud('#ffffff', '#000000', 'spots') },
      ...FIXTURES.map((n) => fixture(n).world.shell),
    ]
    for (const shell of shells)
      for (const view of ['side', 'high'] as const) {
        const g = shellGeometry(shell, view)
        const [col, pat] = ['color', 'pattern'].map((a) => g.getAttribute(a))
        for (let i = 0; i < col!.count; i++) {
          if (pat!.getW(i) < 0.5) continue
          const d = paintDistance(new Color(col!.getX(i), col!.getY(i), col!.getZ(i)), new Color(pat!.getX(i), pat!.getY(i), pat!.getZ(i)))
          expect(d).toBeLessThanOrEqual(SHELL_CALM.most + 1e-4)
        }
      }
    // Far paint comes to the limit, no nearer; near paint is drawn exactly as given.
    const navy = new Color(colorOf(NIGHT.walls.color))
    expect(paintDistance(navy, new Color(colorOf(NIGHT.walls.second)))).toBeGreaterThan(5 * SHELL_CALM.most)
    expect(paintDistance(navy, calmSecond(navy, new Color(colorOf(NIGHT.walls.second))))).toBeCloseTo(SHELL_CALM.most, 4)
    const cream = new Color(colorOf(HOUSE_SHELL.walls.color))
    const near = new Color(colorOf(HOUSE_SHELL.walls.second))
    expect(calmSecond(cream, near).equals(near)).toBe(true)
  })

  it("reaches HOUSE_LOOK.reach metres past the camera's frame on every side, from the side and from high up", () => {
    const side = new Box3().setFromBufferAttribute(shellGeometry(HOUSE_SHELL, 'side').getAttribute('position') as never)
    const f = SIDE_FRAME
    expect(side.min.x).toBeLessThanOrEqual(f.x - f.width / 2 - HOUSE_LOOK.reach + 1e-6)
    expect(side.max.x).toBeGreaterThanOrEqual(f.x + f.width / 2 + HOUSE_LOOK.reach - 1e-6)
    expect(side.min.y).toBeLessThanOrEqual(f.y - f.height / 2 - HOUSE_LOOK.reach + 1e-6)
    expect(side.max.y).toBeGreaterThanOrEqual(f.y + f.height / 2 + HOUSE_LOOK.reach - 1e-6)
    const high = new Box3().setFromBufferAttribute(shellGeometry(HOUSE_SHELL, 'high').getAttribute('position') as never)
    const h = HIGH_FRAME
    expect(high.min.x).toBeLessThanOrEqual(h.x - h.width / 2 - HOUSE_LOOK.reach)
    expect(high.max.x).toBeGreaterThanOrEqual(h.x + h.width / 2 + HOUSE_LOOK.reach)
    expect(high.min.z).toBeLessThanOrEqual(h.z - h.depth / 2 - HOUSE_LOOK.reach)
    expect(high.max.z).toBeGreaterThanOrEqual(h.z + h.depth / 2 + HOUSE_LOOK.reach)
  })

  it('stands behind its darkest timber: the background is the darkest of the house\'s own colours', () => {
    const luma = (c: string) => {
      const k = new Color(c)
      return 0.2126 * k.r + 0.7152 * k.g + 0.0722 * k.b
    }
    const colours = Object.values(HOUSE_LOOK).flatMap((v) => (typeof v === 'string' ? [v] : []))
    expect(Math.min(...colours.map(luma))).toBe(luma(HOUSE_LOOK.timber))
  })

  it('lays the wallpaper in staggered rows on the walls, each copy whole on its wall', () => {
    const side = wallpaperSpots('side')
    expect(side).toHaveLength(25)
    for (const s of side) {
      expect(s.at[2]).toBeCloseTo(ROOM.side.back + MOTIF.off)
      expect(Math.abs(s.at[0]) + MOTIF.size / 2).toBeLessThanOrEqual(ROOM.side.width / 2)
      expect(s.turn).toBe(0)
    }
    const high = wallpaperSpots('high')
    expect(high).toHaveLength(29)
    const b = ROOM_BOUNDS.high
    for (const s of high) {
      const onBack = Math.abs(s.at[2] - (b.min[2] + MOTIF.off)) < 1e-9 && s.turn === 0
      const onLeft = Math.abs(s.at[0] - (b.min[0] + MOTIF.off)) < 1e-9 && s.turn === Math.PI / 2
      const onRight = Math.abs(s.at[0] - (b.max[0] - MOTIF.off)) < 1e-9 && s.turn === -Math.PI / 2
      expect(onBack || onLeft || onRight).toBe(true)
      expect(s.at[1] + MOTIF.size / 2).toBeLessThanOrEqual(ROOM.high.wallHigh)
    }
  })
})

describe('the way out set into a wall', () => {
  it('stands against the back wall from the side, on the floor or a ledge where its foot is', () => {
    expect(doorPlace([3, 0, 0], 'side')).toEqual({ at: [3, 0, expect.closeTo(ROOM.side.back + 0.18, 9)], turn: 0 })
    expect(doorPlace([-5, 2.5, 0.4], 'side').at[1]).toBe(2.5)
  })

  it('stands in the wall its foot is in from high up, facing into the room, and a foot in no wall is an error', () => {
    const b = ROOM_BOUNDS.high
    expect(doorPlace([1.5, 0, b.min[2]], 'high')).toEqual({ at: [1.5, 0, expect.closeTo(b.min[2] + 0.18, 9)], turn: 0 })
    expect(doorPlace([b.min[0], 0, 1], 'high')).toEqual({ at: [expect.closeTo(b.min[0] + 0.18, 9), 0, 1], turn: Math.PI / 2 })
    expect(doorPlace([b.max[0], 0, 1], 'high')).toEqual({ at: [expect.closeTo(b.max[0] - 0.18, 9), 0, 1], turn: -Math.PI / 2 })
    expect(() => doorPlace([0, 0, 0], 'high')).toThrow(/none of the house's walls/)
  })
})

describe('the light of a room (step 7a, Light)', () => {
  it('is 3.3 at light 1 and 2.22 at the least light, two thirds of it, the fill tinted by the ceiling and the floor', () => {
    const total = (light: number) => {
      const l = shellLight({ ...HOUSE_SHELL, light })
      return l.key + l.fill
    }
    expect(total(1)).toBeCloseTo(3.3, 9)
    expect(total(LIGHT_RANGE.least)).toBeCloseTo(2.22, 9)
    expect(total(LIGHT_RANGE.least) / total(1)).toBeCloseTo(0.67, 2)
    const l = shellLight({ ...HOUSE_SHELL, ceiling: { color: '#000000', second: '#000000', pattern: 'plain' }, floor: { color: '#ff0000', second: '#ff0000', pattern: 'plain' } })
    expect(l.sky).toBe(`#${new Color('#000000').lerp(new Color('#ffffff'), LIGHT.tint).getHexString()}`)
    expect(l.ground).toBe(`#${new Color('#ff0000').lerp(new Color('#ffffff'), LIGHT.tint).getHexString()}`)
  })

  it('makes what shines on its own the stronger the dimmer the room: 0.35 at light 1, all of it at the least', () => {
    expect(shineIn(1)).toBeCloseTo(0.35, 9)
    expect(shineIn(0.8)).toBeCloseTo(0.675, 9)
    expect(shineIn(LIGHT_RANGE.least)).toBeCloseTo(1, 9)
  })

  it('lights the room for real by the strongest lamps shown, the first built first among equals', () => {
    const lamp = (id: number, power: number): Lamp => ({ id, name: null, hidden: false, mover: null, at: [0, 0, 0], slide: null, color: '#ffffff', power, reach: 6 })
    const lamps = [lamp(1, 0.5), lamp(2, 1), lamp(3, 0.2), lamp(4, 1), lamp(5, 0.8), lamp(6, 0.6)]
    expect(lampsLit(lamps).map((l) => l.id)).toEqual([2, 4, 5, 6])
    expect(lampsLit(lamps)).toHaveLength(LAMPS_LIT)
  })
})

describe("the scene's fixtures", () => {
  it("stand in the house's one room, with the house's own solids built last as the sim builds them", () => {
    for (const name of FIXTURES) {
      const w = fixture(name).world
      expect(w.bounds).toEqual(ROOM_BOUNDS[w.view])
      expect(w.camera).toEqual(w.view === 'side' ? SIDE_FRAME : expect.objectContaining({ x: 0, width: HIGH_FRAME.width }))
      const house = w.solids.filter((s) => s.house)
      expect(w.solids.slice(-house.length)).toEqual(house)
      const b = w.bounds
      const inside = (p: readonly number[]) => p[0]! >= b.min[0] - 1e-9 && p[0]! <= b.max[0] + 1e-9 && p[1]! >= b.min[1] - 1e-9 && p[1]! <= b.max[1] + 1e-9 && (w.view === 'side' || (p[2]! >= b.min[2] - 1e-9 && p[2]! <= b.max[2] + 1e-9))
      for (const s of w.solids) if (!s.house && s.mover === null) expect(inside(s.at), `${name}: solid ${s.id} at ${s.at.join(', ')}`).toBe(true)
      for (const h of [...w.things, ...w.decor, ...w.zones, ...w.signs, ...w.lamps, ...w.movers]) if (h.mover === null) expect(inside(h.at), `${name}: ${h.id} at ${h.at.join(', ')}`).toBe(true)
      for (const p of w.players) expect(inside(p.at), `${name}: player ${p.seat}`).toBe(true)
      expect(() => doorPlace(w.wayOut.at, w.view)).not.toThrow()
    }
  })

  it('are lit bright, at 0.8 and at the least light, so the screenshots check each', () => {
    expect(FIXTURES.map((n) => fixture(n).world.shell.light)).toEqual([1, 0.8, LIGHT_RANGE.least, 1, 0.8])
  })
})
