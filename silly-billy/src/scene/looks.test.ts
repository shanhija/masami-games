import { Color, type Material, type Mesh } from 'three'
import { describe, expect, it } from 'vitest'

import { palette as castle } from '../../../castle-builder/src/scene/look'
import { BUILTIN_ACTIONS, BUILTIN_ITEMS, LAYOUTS, makeCast } from '../content'
import { Library } from '../engine/library'
import { newSky } from '../engine/sky'
import { createWorld, Sim } from '../engine/sim'
import { restPart, type Sky } from '../engine/types'
import { ActorLayer } from './Actors'
import { arcOf, daylight, newDaylight, pickLamps, SKY, type Lamp } from './daylight'
import { ItemLayer } from './Items'
import { MODEL, flat, glow } from './look'
import { AS_BUILT, Models, ModelView } from './recipeMesh'
import { shownLook, StateLayer } from './States'

/**
 * The scene's reading of the world's new state: the sky's look at each time and weather, the
 * lamps that get real lights, a thing's parts and lights drawn its own way, a thing's added
 * shapes, and the states a body is in.
 */

const sky = (o: Partial<Sky>): Sky => ({ ...newSky(), ...o })
const hex = (c: Color) => `#${c.getHexString()}`

function room() {
  const library = new Library({ items: BUILTIN_ITEMS, actions: BUILTIN_ACTIONS })
  const sim = new Sim(createWorld({ room: 'playground', actors: makeCast('fi'), layouts: LAYOUTS, seed: 3, lang: 'fi' }), library)
  const source = { info: (k: string) => library.info(k), get libraryVersion() { return library.version } }
  return { sim, library, models: new Models(source) }
}

describe('the sky', () => {
  it('is Castle Builder noon by day, a deep blue night with the moon, grey in rain, and the colour code paints', () => {
    const day = daylight(sky({ time: 13 }), newDaylight())
    expect(hex(day.sky)).toBe(hex(new Color(castle.skyHorizon)))
    expect(hex(day.sun)).toBe(hex(new Color(castle.sunlight)))
    expect(day.sunIntensity).toBeCloseTo(2.2, 9)
    expect(day.night).toBe(0)
    expect(day.fog).toBe(0)
    const night = daylight(sky({ time: 23 }), newDaylight())
    expect(hex(night.sky)).toBe(hex(new Color(SKY.night)))
    expect(hex(night.sun)).toBe(hex(new Color(SKY.moon)))
    expect(night.sunIntensity).toBeLessThan(1)
    expect(night.night).toBe(1)
    const dusk = daylight(sky({ time: 19 }), newDaylight())
    expect(dusk.sky.r).toBeGreaterThan(dusk.sky.b * 0.6)
    const rain = daylight(sky({ time: 13, rain: 1 }), newDaylight())
    expect(rain.sunIntensity).toBeLessThan(day.sunIntensity * 0.6)
    expect(rain.fog).toBeGreaterThan(0)
    const pink = daylight(sky({ time: 13, color: '#ff9ccf', light: '#f5a13b' }), newDaylight())
    expect(pink.sky.r).toBeGreaterThan(day.sky.r * 0.99)
    expect(pink.sky.g).toBeLessThan(day.sky.g)
    expect(hex(pink.sun)).toBe(hex(new Color('#f5a13b')))
  })

  it('has the sun up by day and the moon by night, each rising at the left and setting at the right', () => {
    expect(arcOf(6)).toEqual({ moon: false, k: 0 })
    expect(arcOf(12.5)).toEqual({ moon: false, k: 0.5 })
    expect(arcOf(19)).toEqual({ moon: true, k: 0 })
    expect(arcOf(0.5).k).toBeCloseTo(0.5, 9)
  })

  it('gives the few real lights to the strongest lamps nearest the middle of the view', () => {
    const lamp = (x: number, strength: number): Lamp => ({ x, y: 2, z: 0, color: '#ffffff', strength })
    const lamps = [lamp(10, 1), lamp(1, 1), lamp(0, 0.01), lamp(2, 0.9), lamp(-1, 1), lamp(5, 1)]
    expect(pickLamps(lamps, { x: 0, z: 0 }, 3).map((l) => l.x)).toEqual([1, -1, 2])
  })
})

describe('lamps', () => {
  it('a lamp post and a fire shine at night by themselves, not by day; a thing switched off does not; a torch shines day and night', () => {
    const { sim, models } = room()
    const layer = new ItemLayer(models)
    const posts = sim.world.items.filter((it) => it.kind === 'lamp-post')
    expect(posts.length).toBeGreaterThan(0)
    layer.update(sim.world, 0)
    expect(layer.lamps).toEqual([])
    sim.api.sky.time = 23
    layer.update(sim.world, 0)
    expect(layer.lamps.length).toBe(posts.length)
    // From the lantern, up the post, in its yellow.
    for (const l of layer.lamps) expect(l.y).toBeGreaterThan(2.8)
    const one = sim.api.items.find((h) => h.id === posts[0]!.id)!
    one.glow = false
    layer.update(sim.world, 0)
    expect(layer.lamps.length).toBe(posts.length - 1)
    sim.api.sky.time = 12
    const ball = sim.api.items.find((h) => h.kind === 'ball')!
    ball.light = 'red'
    layer.update(sim.world, 0)
    expect(layer.lamps).toEqual([expect.objectContaining({ color: '#e8503f', strength: 0.6 })])
  })

  it('a glowing body lights itself and gives a light; a sick one is drawn green', () => {
    const { sim, models } = room()
    const layer = new ActorLayer(models)
    const aino = sim.world.actors[0]!
    sim.api.actors[0]!.effect('glowing', 5)
    sim.api.actors[1]!.effect('sick', 5)
    layer.update(sim.world, 0)
    expect(layer.lamps.length).toBe(1)
    const materials = new Set<Material>()
    layer.root.traverse((o) => void ((o as Mesh).isMesh && materials.add((o as Mesh).material as Material)))
    expect([...materials].some((m) => m === glow(aino.look.top))).toBe(true)
    const sick = shownLook(sim.world.actors[1]!)
    expect(new Color(sick.skin).g).toBeGreaterThan(new Color(sim.world.actors[1]!.look.skin).g * 0.9)
    expect(sick.skin).not.toBe(sim.world.actors[1]!.look.skin)
    expect([...materials].some((m) => m === flat(sick.skin))).toBe(true)
  })
})

describe('one thing drawn its own way', () => {
  it('hides a part, paints it, makes it glow, switches its lights off and colours them', () => {
    const { sim, library, models } = room()
    const fire = library.info('campfire')
    const model = models.get('campfire', null, null, null)
    expect(model.lights).not.toBe(null)
    const view = new ModelView(model)
    const meshOf = (part: string | null, which: 'solid' | 'glow') => view.meshes.find((m) => m.geometry === model.parts.get(part)![which])!
    view.pose({ flame1: { ...restPart(), show: false }, flame2: { ...restPart(), color: 'blue' } }, AS_BUILT)
    expect(meshOf('flame1', 'glow').parent!.visible).toBe(false)
    expect(meshOf('flame2', 'glow').material).toBe(glow('blue'))
    view.pose({}, { glow: false, glowColor: null })
    expect(meshOf(null, 'glow').material).toBe(MODEL.dim)
    expect(meshOf('flame1', 'glow').material).toBe(MODEL.dim)
    view.pose({ flame1: { ...restPart(), glow: true } }, { glow: false, glowColor: 'red' })
    expect(meshOf('flame1', 'glow').material).toBe(glow('red'))
    expect(meshOf(null, 'glow').material).toBe(MODEL.dim)
    view.pose({}, AS_BUILT)
    expect(meshOf(null, 'solid').material).toBe(MODEL.solid)
    // A thing without lights told to glow glows all over.
    const ball = new ModelView(models.get('ball', null, null, null))
    ball.pose({}, { glow: true, glowColor: null })
    expect(ball.meshes[0]!.material).toBe(MODEL.glow)
    expect(fire.recipe.traits.temp).toBe('hot')
    expect(sim.world.items.length).toBeGreaterThan(0)
  })

  it('draws a thing with shapes added to it as its own model, and its kind as before', () => {
    const { sim, models } = room()
    const bench = sim.api.items.find((h) => h.kind === 'bench')!
    const plain = models.get('bench', null, null, null)
    bench.add((m) => m.box(0.2, 0.2, 0.2, { at: [0, 1, 0], color: 'red' }))
    const it = sim.world.items.find((i) => i.id === bench.id)!
    const own = models.get('bench', null, null, it.added!)
    expect(own).not.toBe(plain)
    expect(own.recipe.shapes.length).toBe(plain.recipe.shapes.length + 1)
    expect(models.get('bench', null, null, null)).toBe(plain)
    expect(models.get('bench', null, null, it.added!)).toBe(own)
  })
})

describe('states over a body', () => {
  it('circles a dizzy head with stars, drips off a wet body, floats Zs off a sleepy one and twinkles round a glowing one', () => {
    const { sim } = room()
    const layer = new StateLayer()
    const [a, b, c, d] = sim.api.actors
    a!.effect('dizzy', 5)
    b!.effect('wet', 5)
    c!.effect('sleepy', 5)
    d!.effect('glowing', 5)
    layer.update(sim.world, 1.3)
    const counts = layer.root.children.map((m) => (m as unknown as { count: number }).count)
    expect(counts).toEqual([4, 3, 2, 0, 4])
  })
})
