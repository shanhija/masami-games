import { Color, Matrix4, ShaderLib, type Material, type Mesh, type Points } from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildRecipe, type Kit } from '../../../silly-billy/src/engine/kit'
import type { Puff, Recipe, Vec3 } from '../../../silly-billy/src/engine/types'
import { colorOf } from '../../../silly-billy/src/scene/look'
import { DRESS_FIT, LOOK_BUDGET, LOOK_PLACE, WALLPAPER_COPIES, wallpaperSpots, type LookBuilt } from '../engine/look'
import { flyPuffs } from '../engine/effects'
import { pieceBox } from '../engine/lookBuilder'
import type { HouseSound } from '../engine/sounds'
import type { Player, World } from '../engine/world'
import { fixture, fixtureLook } from './fixtures'
import { highToScreen, highView, screenRay } from './highCamera'
import { LOOK_PIECE, LOOK_SHOWN, LookView, propMotion, PropMotion, puffsWith, Shine, type PropPlace, type StageLook } from './lookView'
import { modelGeometries, RoomModels } from './models'
import { RoomView, shineIn } from './RoomView'
import { Batch, stillPieces, stillSolid } from './still'

const recipe = (build: (m: Kit) => void): Recipe => buildRecipe((m) => (build(m), {}), ['test']).recipe
const toy = recipe((m) => m.box(0.6, 0.6, 0.6, { at: [0, 0.3, 0], color: '#ff8a3a' }))
const dot = recipe((m) => m.sphere(0.25, { color: '#ffffff' }))

/** A look of plain data with one model, its props and decor as given. */
function lookOf(o: Partial<Pick<LookBuilt, 'props' | 'decor' | 'lights' | 'lamps' | 'wallpaper' | 'dressed'>>, models: Recipe[] = [toy]): LookBuilt {
  return { models, wallpaper: null, dressed: [], decor: [], props: [], lights: [], lamps: [], notes: [], counts: { pieces: 0, props: 0, answering: 0, quarters: 0, lights: 0, lamps: 0, leftOut: 0, of: 0 }, ...o }
}
const prop = (at: Vec3, o: Partial<LookBuilt['props'][number]> = {}): LookBuilt['props'][number] => ({ at, model: 0, scale: 1, turn: 0, react: 'hop', idle: null, sound: 'pop', puff: 'star', ...o })
const stage = (built: LookBuilt, heard: HouseSound[] = []): StageLook => ({ built, taps: [], sound: (s) => heard.push(s) })

// RoomView draws signs and halos on canvases: a canvas that draws nothing is enough to build it here.
const nothing: unknown = new Proxy(() => nothing, { get: (...[, key]: [unknown, string | symbol]) => (key === 'measureText' ? () => ({ width: 10, actualBoundingBoxAscent: 6, actualBoundingBoxDescent: 2 }) : nothing), apply: () => nothing, set: () => true })
afterEach(() => vi.unstubAllGlobals())
const withCanvas = () => vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => nothing }) })

/** A prop's place from the side: its outline on z = 0 as LookView finds it. */
function sidePlace(at: Vec3, o: Partial<LookBuilt['props'][number]> = {}): PropPlace {
  const box = pieceBox(toy, at, 1, 0)
  return { prop: prop(at, o), reach: { min: [box.min[0], box.min[1], 0], max: [box.max[0], box.max[1], 0] }, height: box.max[1] - at[1] }
}

/** A player of the meadow fixture, moved to `x` on the floor. */
function walker(x: number): Player {
  const p = { ...fixture('meadow').world.players[0]! }
  p.at = [x, 0, 0]
  return p
}

describe("a look's props", () => {
  it('react when a player comes in front, at most once a second, and not again for one who stays', () => {
    const motion = new PropMotion([sidePlace([0, 0, -2])], 'side')
    const away = walker(-5)
    const front = walker(0)
    const fired: number[] = []
    const at = (t: number, who: Player) => {
      const before = motion.since[0]
      motion.step(t, [who], [])
      if (motion.since[0] !== before) fired.push(t)
    }
    at(0, away)
    at(0.1, front)
    at(0.2, away)
    at(0.5, front)
    at(0.9, away)
    at(1.2, front)
    for (let t = 1.3; t < 5; t += 0.1) at(t, front)
    expect(fired).toEqual([0.1, 1.2])
  })

  it('react to a tap at most once a second, a tap and a pass together once', () => {
    const motion = new PropMotion([sidePlace([0, 0, -2])], 'side')
    const away = walker(-5)
    const fired: number[] = []
    for (const [t, tap] of [[0, true], [0.4, true], [0.99, true], [1.05, true], [1.5, false], [2.2, true]] as const) {
      const before = motion.since[0]
      motion.step(t, [away], tap ? [0] : [])
      if (motion.since[0] !== before) fired.push(t)
    }
    expect(fired).toEqual([0, 1.05, 2.2])
    const both = new PropMotion([sidePlace([0, 0, -2])], 'side')
    expect(both.step(0, [walker(0)], [0]).sounds).toEqual(['pop'])
  })

  it('sound together at most once in LOOK_SHOWN.soundGap, and puff from their tops', () => {
    const motion = new PropMotion([sidePlace([-4, 0, -2]), sidePlace([0, 0, -2], { sound: 'tweet' }), sidePlace([4, 0, -2], { sound: 'chime', puff: null })], 'side')
    const away = walker(-7.5)
    expect(motion.step(0, [away], [0, 1])).toEqual({ sounds: ['pop'], puffs: [{ at: [-4, 0.6, -2], kind: 'star' }, { at: [0, 0.6, -2], kind: 'star' }] })
    expect(motion.step(0.1, [away], [2]).sounds).toEqual([])
    expect(motion.step(LOOK_SHOWN.soundGap, [away], [])).toEqual({ sounds: [], puffs: [] })
    expect(motion.step(1.2, [away], [2]).sounds).toEqual(['chime'])
  })

  it('pass from high up over their footprint', () => {
    const box = pieceBox(toy, [2, 0, -3], 1, 0)
    const motion = new PropMotion([{ prop: prop([2, 0, -3]), reach: box, height: 0.6 }], 'high')
    const p = walker(2)
    motion.step(0, [{ ...p, at: [2, 0, 1] }], [])
    expect(motion.since[0]).toBe(-Infinity)
    motion.step(0.1, [{ ...p, at: [2, 0, -2.8] }], [])
    expect(motion.since[0]).toBe(0.1)
  })

  it('move from rest to rest: each reaction starts and ends with only the idle, and every idle is gentle', () => {
    for (const react of ['wobble', 'hop', 'spin', 'blink', 'swing'] as const) {
      const place = sidePlace([0, 0, -2], { react, idle: null })
      const rest = { lift: 0, glow: 0, scale: 1, pivot: react === 'swing' ? place.height : 0, spin: 0, tilt: 0, squash: 1, blink: 0 }
      expect(propMotion(place, 0, 5, 5)).toEqual(rest)
      const end = propMotion(place, 0, 5 + LOOK_SHOWN.react - 1e-9, 5)
      // A spin ends a whole turn round, which looks as it began.
      for (const key of Object.keys(rest) as (keyof typeof rest)[]) expect(key === 'spin' ? Math.cos(end.spin) : end[key]).toBeCloseTo(key === 'spin' ? 1 : rest[key], 6)
      expect(propMotion(place, 0, 5 + 2 * LOOK_SHOWN.react, 5)).toEqual(rest)
      const mid = propMotion(place, 0, 5 + LOOK_SHOWN.react / 7, 5)
      expect(mid).not.toEqual(rest)
    }
    for (const idle of ['bob', 'sway', 'spin', 'pulse'] as const) {
      for (let t = 0; t < 10; t += 0.37) {
        const m = propMotion(sidePlace([0, 0, -2], { idle }), 3, t, -Infinity)
        expect(m.lift).toBeGreaterThanOrEqual(0)
        expect(m.lift).toBeLessThan(0.1)
        expect(Math.abs(m.tilt)).toBeLessThan(0.1)
        expect(Math.abs(m.scale - 1)).toBeLessThan(0.1)
      }
    }
  })

  it('draw in one mesh, lit and glowing shapes together, the glowing ones marked to be drawn unlit', () => {
    const lantern = recipe((m) => {
      m.box(0.4, 0.6, 0.4, { at: [0, 0.3, 0], color: '#6a4a2a' })
      m.sphere(0.15, { at: [0, 0.75, 0], color: '#ffe08a', glow: true })
    })
    const view = new LookView(fixture('meadow').world, stage(lookOf({ props: [prop([-6, 0, -2]), prop([6, 0, -2], { model: 1 })] }, [toy, lantern])))
    const meshes = view.root.children.filter((c) => c.type === 'Mesh') as Mesh[]
    expect(meshes).toHaveLength(1)
    const glowing = meshes[0]!.geometry.getAttribute('propGlowing')
    const marks = new Set([...Array(glowing.count).keys()].map((i) => glowing.getX(i)))
    expect([...marks].sort()).toEqual([0, 1])
    view.dispose()
  })

  it('blink so it reads on any colour: the lit shapes light up, the glowing ones go out, and the prop grows a little, twice', () => {
    const place = sidePlace([0, 0, -2], { react: 'blink', idle: null })
    const height = propMotion(place, 0, 5 + LOOK_SHOWN.react / 8, 5)
    expect(height.glow).toBeGreaterThan(0.5)
    expect(height.blink).toBeGreaterThan(0.5)
    expect(height.scale).toBeGreaterThan(1.05)
    const between = propMotion(place, 0, 5 + LOOK_SHOWN.react / 4, 5)
    expect(between.blink).toBeCloseTo(0, 6)
    expect(propMotion(place, 0, 5 + (5 * LOOK_SHOWN.react) / 8, 5).blink).toBeCloseTo(height.blink, 6)
    // The texture carries it in row 1's fourth number, and the glowing shapes' light goes out by it.
    const motion = new PropMotion([place], 'side')
    motion.since[0] = 5
    const data = new Float32Array(LOOK_SHOWN.slots * 2 * 4)
    motion.write(5 + LOOK_SHOWN.react / 8, data)
    expect(data[LOOK_SHOWN.slots * 4 + 3]).toBeCloseTo(height.blink, 6)
    const view = new LookView(fixture('meadow').world, stage(lookOf({ props: [prop([-6, 0, -2])] })))
    const material = (view.root.children.find((c) => c.type === 'Mesh') as Mesh).material as Material
    const shader = { vertexShader: ShaderLib.standard.vertexShader, fragmentShader: ShaderLib.standard.fragmentShader, uniforms: {} }
    material.onBeforeCompile(shader as never, null as never)
    expect(shader.vertexShader).toContain('vPropBlink = propB.w;')
    expect(shader.fragmentShader).toContain(`(1.0 - ${LOOK_SHOWN.blinkOut.toFixed(2)} * vPropBlink), vPropGlowing)`)
    view.dispose()
  })

  it('fit the motion texture, whatever the look budget allows', () => {
    expect(LOOK_SHOWN.slots).toBeGreaterThanOrEqual(LOOK_BUDGET.props)
    const world = fixture('meadow').world
    const props = Array.from({ length: LOOK_SHOWN.slots + 1 }, (_, i) => prop([-7 + (i % 14), 0, -2]))
    expect(() => new LookView(world, stage(lookOf({ props })))).toThrow(/at most 64/)
  })
})

describe('a look in the still batch', () => {
  it('draws the wallpaper once at each place the look counted it, laid flat on its wall', () => {
    for (const name of ['meadow', 'courtyard'] as const) {
      const world = fixture(name).world
      const view = new LookView(world, stage(lookOf({ wallpaper: 0 }, [dot])))
      const piece = view.piece()
      const one = modelGeometries(new RoomModels([dot]).get(0), new Matrix4()).solid!.getAttribute('position').count
      expect(piece.id).toBe(LOOK_PIECE)
      expect(piece.solid!.getAttribute('position').count).toBe(one * WALLPAPER_COPIES[world.view])
      expect(wallpaperSpots(world.view)).toHaveLength(WALLPAPER_COPIES[world.view])
      // Every copy within MOTIF.size of its spot and close to its wall.
      piece.solid!.computeBoundingBox()
      const b = piece.solid!.boundingBox!
      if (world.view === 'side') expect(b.max.z - b.min.z).toBeLessThanOrEqual(LOOK_SHOWN.flat + 1e-6)
    }
  })

  it('washes what stands wholly behind the play toward the walls, from the side only', () => {
    const colours = (name: 'meadow' | 'courtyard', at: Vec3) => {
      const world = fixture(name).world
      const g = new LookView(world, stage(lookOf({ decor: [{ at, model: 0, scale: 1, turn: 0 }] }))).piece().solid!
      return { color: g.getAttribute('color'), walls: new Color(colorOf(world.shell.walls.color)) }
    }
    const own = new Color(colorOf('#ff8a3a'))
    const behind = colours('meadow', [0, 0, LOOK_PLACE.behind - 0.4])
    expect(behind.color.getX(0)).toBeCloseTo(own.r + (behind.walls.r - own.r) * LOOK_SHOWN.wash, 5)
    expect(behind.color.getZ(0)).toBeCloseTo(own.b + (behind.walls.b - own.b) * LOOK_SHOWN.wash, 5)
    const front = colours('meadow', [0, 0, 1.2])
    expect(front.color.getX(0)).toBeCloseTo(own.r, 5)
    const high = colours('courtyard', [0, 0, -3.5])
    expect(high.color.getX(0)).toBeCloseTo(own.r, 5)
  })

  it('draws a dressed solid as its model instead of its plain shape, and takes it out as any solid when the play changes it', () => {
    const world = fixture('meadow').world
    const solid = world.solids[1]!
    const bed = recipe((m) => m.box(2, 1, 2, { at: [0, 0.5, 0], color: '#9a6b43' }))
    const view = new LookView(world, stage(lookOf({ dressed: [{ solid: solid.id, model: 0 }] }, [bed])))
    const models = new RoomModels(world.models)
    const plain = stillPieces(world, models, true, new Map()).get(null)!.find((p) => p.id === solid.id)!
    const dressed = stillPieces(world, models, true, view.dressed).get(null)!.find((p) => p.id === solid.id)!
    const colorOfPiece = (p: typeof plain) => new Color().fromArray(p.solid!.getAttribute('color').array as Float32Array, 0)
    expect(colorOfPiece(dressed).getHexString()).toBe(new Color(colorOf('#9a6b43')).getHexString())
    expect(colorOfPiece(plain).getHexString()).not.toBe(colorOfPiece(dressed).getHexString())
    const batch = new Batch(stillPieces(world, models, true, view.dressed).get(null)!)
    batch.takeOut(solid.id)
    expect(batch.has(solid.id)).toBe(false)
  })
})

describe("a look's small lights and puffs", () => {
  it("are one draw call however many, with every lamp's halo, as bright as the room is dim", () => {
    const world = fixture('night').world
    const lights = Array.from({ length: LOOK_BUDGET.lights }, (_, i): LookBuilt['lights'][number] => ({ at: [-7 + (i % 40) * 0.35, 1 + Math.floor(i / 40) * 0.6, -2.9], color: '#fff6c0', size: 0.2, twinkle: i % 2 === 0 }))
    const lamps = [...Array(12).keys()].map((i): LookBuilt['lamps'][number] => ({ at: [-6 + i, 6, -2], color: '#ffd28a', power: 0.8, reach: 6 }))
    const shine = new Shine(lights, shineIn(world.shell.light), lamps.length)
    expect(shine.points.material.uniforms.strength!.value).toBe(1)
    // The lamps' halos are tone mapped as the lit room is; the small lights shine at their own strength.
    expect(shine.points.material.toneMapped).toBe(true)
    expect(shine.points.material.fragmentShader).toContain('vec3 lampTint = toneMapping(vTint);')
    expect(shine.points.material.fragmentShader).toContain('mix(vTint * (core + glow) * strength * vShine, lampTint * halo, vLamp)')
    expect(shine.points.geometry.getAttribute('position').count).toBe(LOOK_BUDGET.lights + lamps.length)
    expect(shine.points.geometry.drawRange.count).toBe(LOOK_BUDGET.lights)
    shine.setLamps(lamps.slice(0, 3).map((l) => ({ at: l.at, tint: new Color(1, 0.8, 0.5) })))
    expect(shine.points.geometry.drawRange.count).toBe(LOOK_BUDGET.lights + 3)
    // In the room, the look's lights and every lamp's halo are its one Points: the look itself draws none.
    withCanvas()
    const room = new RoomView(world, () => null, true, stage(lookOf({ lights, lamps })))
    const all: Points[] = []
    room.root.traverse((o) => {
      if (o.type === 'Points') all.push(o as Points)
    })
    expect(all.map((p) => p.geometry.getAttribute('position').count)).toEqual([LOOK_BUDGET.lights + lamps.length + world.lamps.length])
    room.dispose()
    shine.dispose()
    expect(shineIn(0.6)).toBe(1)
    expect(shineIn(1)).toBeCloseTo(0.35, 9)
  })

  it("fly one kind of the props' puffs at a time, so they add at most one draw call", () => {
    const world = fixture('meadow').world
    const away = { ...world, players: [] } as World
    const view = new LookView(world, stage(lookOf({ props: [prop([-6, 0, -2], { puff: 'leaf' }), prop([4, 0, -2], { puff: 'heart' })] })))
    const tap = (i: number) => {
      const r = view.motion.places[i]!.reach
      view.tapAt([(r.min[0] + r.max[0]) / 2, (r.min[1] + r.max[1]) / 2, 0])
    }
    tap(0)
    tap(1)
    view.update(away, 1)
    expect(view.motion.since).toEqual([1, 1])
    expect([...new Set(view.puffs.puffs.map((p) => p.kind))]).toEqual(['leaf'])
    // Once the leaves have flown, the heart's puff flies.
    tap(1)
    view.update(away, 5)
    expect([...new Set(view.puffs.puffs.map((p) => p.kind))]).toEqual(['heart'])
    view.dispose()
  })

  it("fly as the World's do, by the game's clock: still while it stands, never more than LOOK_SHOWN.puffStep a frame", () => {
    const world = fixture('meadow').world
    const away = { ...world, players: [] } as World
    const view = new LookView(world, stage(lookOf({ props: [prop([-6, 0, -2], { puff: 'confetti' })] })))
    const r = view.motion.places[0]!.reach
    view.tapAt([(r.min[0] + r.max[0]) / 2, (r.min[1] + r.max[1]) / 2, 0])
    view.update(away, 1)
    const where = () => view.puffs.puffs.map((p) => [p.x, p.y, p.z])
    const born = where()
    expect(born.length).toBeGreaterThan(0)
    view.update(away, 1)
    expect(where()).toEqual(born)
    view.update(away, 1.05)
    const flown = where()
    expect(flown).not.toEqual(born)
    // A long frame flies them only LOOK_SHOWN.puffStep: as far as a step of that from where they are.
    const copy = { t: 1.05, puffs: view.puffs.puffs.map((p) => ({ ...p })) }
    flyPuffs(copy, LOOK_SHOWN.puffStep)
    view.update(away, 1.3)
    expect(where()).toEqual(copy.puffs.map((p) => [p.x, p.y, p.z]))
    view.dispose()
  })

  it("fly beside the World's, never past Silly Billy's cap", () => {
    const puff = (born: number): Puff => ({ kind: 'star', x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, color: '#fff', size: 1, born, life: 1, gravity: 0 })
    const world = [puff(0), puff(1)]
    const props = [puff(2), puff(3), puff(4)]
    expect(puffsWith(world, [], 4)).toBe(world)
    expect(puffsWith(world, props, 10)).toEqual([...world, ...props])
    expect(puffsWith(world, props, 4)).toEqual([...world, puff(3), puff(4)])
    expect(puffsWith(world, props, 2)).toEqual(world)
  })
})

describe('a tap on a prop', () => {

  it('from the side reacts where its outline on z = 0 holds the point, never otherwise', () => {
    const world = fixture('meadow').world
    const view = new LookView(world, stage(lookOf({ props: [prop([-6, 4, -2])] })))
    const away = { ...world, players: [] } as World
    view.tapAt([2, 4.3, 0])
    view.update(away, 1)
    expect(view.motion.since[0]).toBe(-Infinity)
    const reach = view.motion.places[0]!.reach
    view.tapAt([(reach.min[0] + reach.max[0]) / 2, (reach.min[1] + reach.max[1]) / 2, 0])
    view.update(away, 2)
    expect(view.motion.since[0]).toBe(2)
  })

  it('from high up reacts when the line from the eye meets it before the play, and the play hears the tap the same with the prop under the finger', () => {
    withCanvas()
    const { world } = fixture('courtyard')
    const at: Vec3 = [0, 0, 2.2]
    const heard: HouseSound[] = []
    const bench: Vec3 = [-3.5, 0, 0]
    const look = stage(lookOf({ props: [prop(at, { sound: 'meow' })], decor: [{ at: bench, model: 0, scale: 1, turn: 0 }] }), heard)
    const bare = new RoomView(world, () => null, true, null)
    const dressed = new RoomView(world, () => null, true, look)
    const screen = { width: 1280, height: 800, clearBottom: 0, clearTop: 90 }
    const v = highView(world.bounds, world.floorFrame!, screen, [0, 0])
    const [px, py] = highToScreen(v, [at[0], at[1] + 0.3, at[2]])
    const ray = screenRay(v, px, py)
    // The play's point is the same with the prop and without it, and through the look's decor: the look never takes a tap.
    expect(dressed.pick(ray.from, ray.way)).toEqual(bare.pick(ray.from, ray.way))
    const [dx, dy] = highToScreen(v, [bench[0], 0.5, bench[2]])
    const onDecor = screenRay(v, dx, dy)
    expect(bare.pick(onDecor.from, onDecor.way)![1]).toBeCloseTo(0, 6)
    expect(dressed.pick(onDecor.from, onDecor.way)).toEqual(bare.pick(onDecor.from, onDecor.way))
    dressed.tapRay(ray.from, ray.way)
    dressed.update(world, 3, 1 / 60, 'en')
    expect(heard).toEqual(['meow'])
    // A tap where the play stands in front of it is the play's alone: the blue box hides a prop behind it.
    const hidden = stage(lookOf({ props: [prop([-0.2, 0, -2.4])] }), heard)
    const behind = new RoomView(world, () => null, true, hidden)
    const box = world.solids.find((s) => s.surface.color === '#5aa9ff')!
    const [bx, by] = highToScreen(v, [box.at[0], box.at[1] + 0.4, box.at[2]])
    const r2 = screenRay(v, bx, by)
    behind.tapRay(r2.from, r2.way)
    behind.update(world, 3, 1 / 60, 'en')
    expect(heard).toEqual(['meow'])
    for (const r of [bare, dressed, behind]) r.dispose()
  })

  it('from high up gives the play the same point with a solid dressed as without: past its sides, through the gaps under its top and on it', () => {
    withCanvas()
    const { world } = fixture('courtyard')
    const ledge = world.solids.find((s) => !s.house && s.mover === null && s.shape.kind === 'box' && stillSolid(s))!
    if (ledge.shape.kind !== 'box') throw new Error('the ledge is a box')
    const [w, h, d] = ledge.shape.size
    const over = DRESS_FIT.past - 0.05
    // A table as wide as the dressing may reach, its top a slab and four thin legs under it: wider than the solid, and open under its top.
    const table = recipe((m) => {
      m.box(w + 2 * over, 0.1, d + 2 * over, { at: [0, h - 0.05, 0], color: '#a0522d' })
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.box(0.1, h - 0.1, 0.1, { at: [(sx * w) / 2, (h - 0.1) / 2, (sz * d) / 2], color: '#a0522d' })
    })
    const bare = new RoomView(world, () => null, true, null)
    const dressed = new RoomView(world, () => null, true, stage(lookOf({ dressed: [{ solid: ledge.id, model: 0 }] }, [table])))
    const v = highView(world.bounds, world.floorFrame!, { width: 1280, height: 800, clearBottom: 0, clearTop: 90 }, [0, 0])
    const [x, y, z] = ledge.at
    const top = y + h / 2
    const aims: Vec3[] = [
      [x + w / 2 + 0.2, top - 0.05, z],
      [x - w / 2 - 0.2, top - 0.05, z + d / 4],
      [x, y - h / 4, z + d / 2],
      [x + w / 4, y, z + d / 2],
      [x, top, z],
    ]
    for (const aim of aims) {
      const [px, py] = highToScreen(v, aim)
      const ray = screenRay(v, px, py)
      expect(dressed.pick(ray.from, ray.way)).toEqual(bare.pick(ray.from, ray.way))
    }
    for (const r of [bare, dressed]) r.dispose()
  })

  it("comes from the fixtures' looks in every quarter, as a look must", () => {
    for (const name of ['meadow', 'night', 'courtyard'] as const) {
      const built = fixtureLook(name, 'dressed', fixture(name).world)
      expect(built.counts.props).toBeGreaterThanOrEqual(8)
      expect(built.counts.quarters).toBe(4)
      expect(built.counts.pieces).toBeLessThanOrEqual(LOOK_BUDGET.pieces)
    }
    const heaviest = fixtureLook('meadow', 'heaviest', fixture('meadow').world).counts
    expect(heaviest).toMatchObject({ props: LOOK_BUDGET.props, lights: LOOK_BUDGET.lights })
    expect(heaviest.pieces).toBeGreaterThan(LOOK_BUDGET.pieces - 30)
    expect(heaviest.pieces).toBeLessThanOrEqual(LOOK_BUDGET.pieces)
  })
})
