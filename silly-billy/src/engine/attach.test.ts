/**
 * Things put exactly at another and fixed to it, and one thing's own added shapes and the way
 * its parts are drawn: Sami's treehouse with stairs that touch it ("tee siihen portaat" built
 * them beside, unattached), a lamp on a pole, a sign on a door that swings, a ladder added to
 * one treehouse only, and everything code may write to a part made sane.
 */
import { describe, expect, it } from 'vitest'

import type { ItemApi } from './api'
import { offsetIn, holdFrame } from './attach'
import { actionEntry, itemEntry, makeSim, newLibrary, run, runUntil, step } from './testing'
import { restPart, type Item } from './types'
import { anchorPoint, infoFor } from './world'

/** Sami's made things from the morning of 2026-11-09, as Opus wrote them. */
const TREEHOUSE =
  "const wood = '#a0622d', dark = '#6b3f1d'\nm.cylinder(0.3, 0.4, 3, { at: [0, 1.5, 0], color: dark })\nfor (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) m.cylinder(0.07, 0.07, 2.1, { at: [x, 1.05, z], color: dark })\nm.box(2, 0.15, 2, { at: [0, 2.15, 0], color: '#8a5a34' })\nm.box(1.7, 1.1, 1.7, { at: [0, 2.8, 0], color: wood })\nm.box(0.45, 0.45, 0.06, { at: [0.4, 2.9, 0.86], color: '#9fd8ff' })\nm.box(0.55, 0.08, 0.08, { at: [0.4, 2.65, 0.88], color: dark })\nm.part('door', { at: [-0.6, 2.25, 0.86] }, () => {\n  m.box(0.45, 0.75, 0.05, { at: [0.22, 0.38, 0], color: dark })\n})\nm.cylinder(0, 1.5, 1, { at: [0, 3.85, 0], rot: [0, Math.PI / 4, 0], color: '#d93a2f' })\nfor (let i = 0; i < 6; i++) m.box(0.5, 0.06, 0.08, { at: [0, 0.3 + i * 0.32, 1.0], color: '#c9894a' })\nm.box(0.06, 2.1, 0.06, { at: [-0.25, 1.05, 1.0], color: dark })\nm.box(0.06, 2.1, 0.06, { at: [0.25, 1.05, 1.0], color: dark })\nm.anchor('top', [0, 2.25, 0])\nreturn { carry: 'no', ride: false, sit: false, wear: null, bouncy: 0, solid: true }"
const STAIRS =
  "const wood = '#c8955a', dark = '#a8743f'\nfor (let i = 0; i < 3; i++) {\n  const h = 0.2 * (i + 1)\n  m.box(0.8, h, 0.3, { at: [0, h / 2, 0.3 - i * 0.3], color: wood })\n  m.box(0.82, 0.04, 0.32, { at: [0, h, 0.3 - i * 0.3], color: dark })\n}\nfor (const x of [-0.42, 0.42]) {\n  m.box(0.04, 0.04, 0.95, { at: [x, 0.75, 0], rot: [0.55, 0, 0], color: dark })\n  m.box(0.04, 0.5, 0.04, { at: [x, 0.35, 0.4], color: dark })\n  m.box(0.04, 0.5, 0.04, { at: [x, 0.85, -0.35], color: dark })\n}\nm.anchor('top', [0, 0.6, -0.3])\nreturn { carry: 'no', ride: false, sit: false, wear: null, bouncy: 0.1, solid: true }"
const LAMP = "m.cylinder(0.1, 0.1, 0.3, { at: [0, 0.15, 0], color: 'black' })\nm.sphere(0.12, { at: [0, 0.4, 0], color: 'yellow', glow: true })\nreturn { carry: 'hand', solid: false }"

function sim() {
  const library = newLibrary()
  for (const [id, code] of [['treehouse', TREEHOUSE], ['stairs', STAIRS], ['lamp', LAMP]] as const) expect(library.addItem(itemEntry(id, code))).toEqual({ ok: true })
  return makeSim({ library, layouts: { playground: [{ kind: 'treehouse', x: 2, z: -4, yaw: 0.6 }, { kind: 'rock', x: -5, z: -5, fixed: true }] } })
}

const handle = (s: ReturnType<typeof sim>, it: Item): ItemApi => s.api.items.find((h) => h.id === it.id)!
const find = (s: ReturnType<typeof sim>, kind: string) => s.world.items.find((it) => it.kind === kind)!

/** A point of a thing in its own frame, unscaled: where world point p is on it. */
function local(it: Item, p: { x: number; y: number; z: number }) {
  const dx = p.x - it.x
  const dz = p.z - it.z
  return { x: (dx * Math.cos(it.yaw) - dz * Math.sin(it.yaw)) / it.scale, y: (p.y - it.y) / it.scale, z: (dx * Math.sin(it.yaw) + dz * Math.cos(it.yaw)) / it.scale }
}

describe('putting a thing at another', () => {
  it('puts the stairs at the treehouse front, touching its ladder (not the roof above), facing away, on the ground', () => {
    const s = sim()
    const house = find(s, 'treehouse')
    const stairs = s.api.make('stairs', { x: -6, z: 6 })
    stairs.putAt(handle(s, house), 'front')
    const st = s.world.items.find((it) => it.id === stairs.id)!
    // Facing away from the house: its own front looks where the house's front does.
    expect(st.yaw).toBeCloseTo(house.yaw, 9)
    expect(st.y).toBeCloseTo(0, 9)
    // Its high back end (z -0.46 of the stairs) lies on the house's front at the ladder (z 1.04), well inside the roof's 1.5.
    const back = local(house, { x: st.x - Math.sin(st.yaw) * 0.46, y: 0, z: st.z - Math.cos(st.yaw) * 0.46 })
    expect(back.z).toBeCloseTo(1.04, 2)
    expect(back.x).toBeCloseTo(0, 6)
    // Left there, it stays.
    run(s, 1)
    expect(st.loose).toBe(false)
    expect(st.y).toBeCloseTo(0, 9)
  })

  it('puts things at each side, on top, and at an anchor', () => {
    const s = sim()
    const house = handle(s, find(s, 'treehouse'))
    const lamp = s.api.make('lamp', { x: 5, z: 5 })
    for (const [side, turn] of [['left', Math.PI / 2], ['back', Math.PI], ['right', -Math.PI / 2]] as const) {
      lamp.putAt(house, side)
      const p = local(find(s, 'treehouse'), lamp)
      expect(lamp.yaw).toBeCloseTo(house.yaw + turn, 9)
      // Beside the posts and the trunk (0.87 m out), not inside them.
      expect(Math.max(Math.abs(p.x), Math.abs(p.z))).toBeGreaterThan(0.86)
    }
    // The treehouse says where its top is (the floor up in the tree): that, not the roof's tip.
    lamp.putAt(house, 'top')
    expect(lamp.y).toBeCloseTo(2.25, 6)
    const stairs = s.api.make('stairs', { x: -6, z: 6 })
    lamp.putAt(stairs, 'top')
    expect(lamp.y).toBeCloseTo(0.6, 6)
    lamp.putAt(house, 'somewhere')
    expect(lamp.yaw).toBeCloseTo(house.yaw, 9)
    expect(lamp.y).toBeCloseTo(0, 9)
    lamp.putAt(house, 'door')
    // The door part's pivot, the lamp's bottom there.
    const door = local(find(s, 'treehouse'), lamp)
    expect(door).toMatchObject({ x: expect.closeTo(-0.6, 6), y: expect.closeTo(2.25, 6), z: expect.closeTo(0.86, 6) })
  })

  it('puts a thing in front of an actor and on their head', () => {
    const s = sim()
    const alice = s.api.actors[0]!
    const lamp = s.api.make('lamp', { x: 5, z: 5 })
    lamp.putAt(alice, 'front')
    expect(s.api.distance(lamp, alice)).toBeGreaterThan(alice.radius)
    expect(s.api.distance(lamp, alice)).toBeLessThan(alice.radius + 0.3)
    lamp.putAt(alice, 'head')
    expect(lamp.y).toBeCloseTo(alice.headAt().y, 6)
  })
})

describe('fixing a thing to another', () => {
  it('"tee puumajaan tikkaat": stairs fixed to the treehouse go and turn with it until they come off', () => {
    const s = sim()
    const house = handle(s, find(s, 'treehouse'))
    const stairs = s.api.make('stairs', { x: -6, z: 6 })
    stairs.attachTo(house, 'front')
    expect(stairs.attachedTo).toBe(house)
    const before = local(find(s, 'treehouse'), stairs)
    house.x += 3
    house.yaw += 1.2
    s.step()
    const after = local(find(s, 'treehouse'), stairs)
    expect(after.x).toBeCloseTo(before.x, 9)
    expect(after.z).toBeCloseTo(before.z, 9)
    expect(stairs.yaw).toBeCloseTo(house.yaw, 9)
    // Nothing loosens it: it does not fall, physics leaves it alone, and a copy of the world keeps it.
    run(s, 2)
    expect(s.world.items.find((it) => it.id === stairs.id)!.attached).toMatchObject({ to: house.id, at: null })
    expect(structuredClone(s.world)).toEqual(s.world)
    stairs.detach()
    expect(stairs.attachedTo).toBe(null)
    house.x -= 3
    s.step()
    expect(Math.abs(stairs.x - house.x)).toBeGreaterThan(2)
  })

  it('a sign fixed at a part swings with it; a lamp left high on a pole stays up while fixed and falls when let go', () => {
    const s = sim()
    const house = handle(s, find(s, 'treehouse'))
    const lamp = s.api.make('lamp', { x: 5, z: 5 })
    lamp.attachTo(house, 'door')
    expect(s.world.items.find((it) => it.id === lamp.id)!.attached!.at).toBe('door')
    const shut = { x: lamp.x, z: lamp.z }
    house.part('door').ry = 1.4
    s.step()
    expect(Math.hypot(lamp.x - shut.x, lamp.z - shut.z)).toBeLessThan(0.01)
    lamp.detach()
    lamp.attachTo(house, 'top')
    const high = lamp.y
    run(s, 1)
    expect(lamp.y).toBeCloseTo(high, 9)
    lamp.detach()
    run(s, 2)
    // It stood on the treehouse's top, which holds it up; pushed off the edge, it falls.
    lamp.x = house.x + 3
    run(s, 2)
    expect(lamp.y).toBeLessThan(0.5)
  })

  it('comes off when picked up, thrown or when what it is fixed to goes away', () => {
    const s = sim()
    const house = handle(s, find(s, 'treehouse'))
    const lamp = s.api.make('lamp', { x: 5, z: 5 })
    const pole = s.api.make('lamp', { x: 4, z: 3 })
    lamp.attachTo(pole, 'left')
    s.give('alice', [step('pick-up', { thing: lamp.id })], true)
    runUntil(s, 'done', 'alice', 15)
    expect(lamp.holder?.id).toBe('alice')
    expect(lamp.attachedTo).toBe(null)
    lamp.attachTo(house, 'left')
    expect(lamp.holder).toBe(null)
    s.api.throw(lamp, { x: 0, z: 0 })
    expect(lamp.attachedTo).toBe(null)
    lamp.attachTo(house, 'top')
    s.api.remove(house)
    expect(lamp.attachedTo).toBe(null)
    run(s, 2)
    expect(lamp.y).toBeLessThan(0.6)
  })

  it('refuses a ring, and keeps a thing code moves fixed where it put it', () => {
    const s = sim()
    const house = handle(s, find(s, 'treehouse'))
    const a = s.api.make('lamp', { x: 5, z: 5 })
    const b = s.api.make('lamp', { x: 6, z: 5 })
    a.attachTo(b)
    b.attachTo(a)
    expect(b.attachedTo).toBe(null)
    b.attachTo(house, 'right')
    a.attachTo(b)
    a.attachTo(a)
    expect(a.attachedTo).toBe(b)
    // A chain follows: house → b → a.
    a.y += 1
    const lifted = local(find(s, 'treehouse'), a)
    house.yaw += 2
    run(s, 0.2)
    expect(local(find(s, 'treehouse'), a)).toMatchObject({ x: expect.closeTo(lifted.x, 6), y: expect.closeTo(lifted.y, 6), z: expect.closeTo(lifted.z, 6) })
  })

  it('a thing fixed to someone goes with them, into another room too', () => {
    const s = sim()
    const alice = s.api.actors[0]!
    const lamp = s.api.make('lamp', { x: 5, z: 5 })
    lamp.attachTo(alice, 'head')
    s.give('alice', [step('walk', { target: '4,0' })], true)
    runUntil(s, 'done', 'alice', 10)
    expect(lamp.y).toBeCloseTo(alice.headAt().y, 1)
    expect(Math.hypot(lamp.x - alice.x, lamp.z - alice.z)).toBeLessThan(0.3)
    s.enterRoom('forest')
    expect(s.world.items.some((it) => it.id === lamp.id)).toBe(true)
    s.removeActor('alice')
    expect(s.world.items.find((it) => it.id === lamp.id)!.attached).toBe(null)
  })

  it('works from made code: the frame the offset is kept in puts it back exactly', () => {
    const library = newLibrary()
    for (const [id, code] of [['treehouse', TREEHOUSE], ['stairs', STAIRS]] as const) library.addItem(itemEntry(id, code))
    library.addAction(actionEntry('stairs-to', [{ name: 'thing', kind: 'item', about: '', optional: true }], "const house = args.thing || w.find('treehouse')\nconst st = w.make('stairs')\nst.attachTo(house, 'front')\nme.say('Ta-da!')\nyield"))
    const s = makeSim({ library, layouts: { playground: [{ kind: 'treehouse', x: 0, z: -5 }] } })
    s.give('alice', [step('stairs-to', { thing: 'treehouse' })], true)
    runUntil(s, 'done', 'alice', 2)
    const st = find(s, 'stairs')
    const f = holdFrame(s.side, s.library, st.attached!)!
    expect(offsetIn(f, st)).toMatchObject({ x: expect.closeTo(st.attached!.x, 9), z: expect.closeTo(st.attached!.z, 9), yaw: expect.closeTo(0, 9) })
  })
})

describe('one thing of its own', () => {
  it('adds a ladder to one treehouse only: its own shapes, anchor and size; others of its kind are as they were', () => {
    const s = sim()
    const house = handle(s, find(s, 'treehouse'))
    const other = s.api.make('treehouse', { x: -6, z: 5 })
    const before = house.size.d
    house.add((m) => {
      for (let i = 0; i < 8; i++) m.box(0.6, 0.05, 0.05, { at: [0, 0.25 + i * 0.27, 1.6], color: 'brown' })
      m.anchor('ladderTop', [0, 2.2, 1.6])
      m.box(0.5, 0.5, 0.5, { at: [0, 0.25, 2.6], color: 'green' })
    })
    expect(house.size.d).toBeGreaterThan(before)
    expect(other.size.d).toBeCloseTo(before, 9)
    expect(house.anchors).toContain('ladderTop')
    expect(other.anchors).not.toContain('ladderTop')
    const it = find(s, 'treehouse')
    const info = infoFor(s.library, it)
    expect(info.recipe.shapes.length).toBe(s.library.info('treehouse').recipe.shapes.length + 9)
    const top = anchorPoint(it, info, 'ladderTop')
    expect(local(it, { x: top[0], y: top[1], z: top[2] })).toMatchObject({ y: expect.closeTo(2.2, 6), z: expect.closeTo(1.6, 6) })
    // The same info is given again until something else is added.
    expect(infoFor(s.library, it)).toBe(info)
    expect(structuredClone(s.world)).toEqual(s.world)
  })

  it('adds onto a part, and a part made under a name the thing has moves with that part', () => {
    const s = sim()
    const house = handle(s, find(s, 'treehouse'))
    house.add((m) => m.sphere(0.05, { at: [0.4, 0.38, 0.05], color: 'gold' }), 'door')
    house.add((m) => m.part('door', { at: [0.6, 2.25, 0.86] }, () => m.box(0.45, 0.75, 0.05, { at: [-0.22, 0.38, 0] })))
    const added = find(s, 'treehouse').added!
    expect(added.shapes[0]!.part).toBe('door')
    expect(added.parts).toEqual([{ name: 'door+2', at: [0.6, 2.25, 0.86], rot: [0, 0, 0], parent: null, pose: 'door' }])
    expect(house.parts).toEqual(['door'])
  })

  it('stops adding past the cap', () => {
    const s = sim()
    const house = handle(s, find(s, 'treehouse'))
    for (let k = 0; k < 5; k++) house.add((m) => {
      for (let i = 0; i < 50; i++) m.box(0.1, 0.1, 0.1, { at: [0, i * 0.1, 2] })
    })
    expect(find(s, 'treehouse').added!.shapes.length).toBe(120)
  })

  it('draws a part its own way: a colour, hidden, glowing; what code writes there is made sane', () => {
    const library = newLibrary()
    library.addItem(itemEntry('treehouse', TREEHOUSE))
    library.addAction(actionEntry('paint-door', [], "const h = w.find('treehouse')\nconst d = h.part('door')\nd.color = 'red'\nd.show = 0\nd.glow = 'yes'\nh.part('door').ry = 1\nh.part('nope').color = 'blue'\nyield"))
    const s = makeSim({ library, layouts: { playground: [{ kind: 'treehouse', x: 0, z: -5 }] } })
    s.give('alice', [step('paint-door')], true)
    runUntil(s, 'done', 'alice', 1)
    expect(find(s, 'treehouse').parts).toEqual({ door: { ...restPart(), ry: 1, color: '#e8503f', show: false, glow: null } })
  })

  it('switches its lights, colours them and gives a real light, and says what it is', () => {
    const s = sim()
    const lamp = s.api.make('lamp', { x: 5, z: 5 })
    lamp.glow = false
    lamp.glowColor = 'blue'
    lamp.light = 'orange'
    expect(s.world.items.find((it) => it.id === lamp.id)).toMatchObject({ glow: false, glowColor: '#4a78e0', light: '#f5a13b' })
    lamp.glow = 3 as unknown as boolean
    lamp.glowColor = 'nonsense'
    lamp.light = true as unknown as string
    expect(lamp.glow).toBe(false)
    expect(lamp.glowColor).toBe('#4a78e0')
    expect(lamp.light).toBe('#fff2c8')
    lamp.light = null
    expect(lamp.light).toBe(null)
    expect(lamp.meta).toMatchObject({ carry: 'hand', solid: false, food: null, temp: null, soft: false })
  })
})
