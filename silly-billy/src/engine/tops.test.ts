/**
 * Getting onto a thing's top and staying there, moving things of any size, sizing a thing to
 * reach up to another, and a step's new thing. From Sami's play of 2026-11-09 (later): a script
 * that jumped onto a trampoline landed on its rim and the back flip after it came down on the
 * grass; a thing too big to carry said "Too big!" and then popped onto another anyway; and a step
 * that built a kind rebuilt the one already standing in the room.
 */
import { describe, expect, it } from 'vitest'

import type { ActorApi, ItemApi } from './api'
import { actionEntry, itemEntry, makeSim, newLibrary, run, runUntil, step } from './testing'
import type { Item } from './types'
import { anchorPoint, infoFor } from './world'

/** A low round mat on legs (its own top anchor), a tall platform (top 2.2), a table with no top anchor, a flat strip on the ground, a tall chute. */
const MAT = "m.cylinder(0.9, 0.9, 0.06, { at: [0, 0.85, 0], color: 'black' })\nfor (let i = 0; i < 4; i++) m.cylinder(0.04, 0.04, 0.85, { at: [Math.cos(i * 1.57) * 0.9, 0.42, Math.sin(i * 1.57) * 0.9], color: 'grey' })\nm.anchor('top', [0, 0.9, 0])\nreturn { carry: 'no', solid: true, bouncy: 0.8 }"
const TOWER = "m.box(1.6, 0.15, 1.6, { at: [0, 2.12, 0], color: 'brown' })\nfor (const x of [-0.7, 0.7]) for (const z of [-0.7, 0.7]) m.box(0.12, 2.1, 0.12, { at: [x, 1.05, z], color: 'brown' })\nm.box(1.6, 1, 1.6, { at: [0, 2.7, 0], color: 'tan' })\nm.anchor('top', [0, 2.2, 0])\nreturn { carry: 'no', solid: true }"
const TABLE = "m.box(1.2, 0.08, 0.8, { at: [0, 0.72, 0], color: 'brown' })\nfor (const x of [-0.55, 0.55]) for (const z of [-0.35, 0.35]) m.box(0.06, 0.7, 0.06, { at: [x, 0.35, z], color: 'brown' })\nreturn { carry: 'no', solid: true }"
const STRIP = "m.box(0.9, 0.1, 3, { at: [0, 0.05, 0], color: 'grey' })\nreturn { carry: 'no', solid: false }"
const CART = "m.box(1, 0.4, 0.8, { at: [0, 0.3, 0], color: 'red' })\nfor (const x of [-0.45, 0.45]) for (const z of [-0.3, 0.3]) m.cylinder(0.1, 0.1, 0.06, { at: [x, 0.1, z], rot: [0, 0, Math.PI / 2], color: 'black' })\nm.anchor('seat', [0, 0.5, 0])\nreturn { carry: 'no', ride: true, solid: true }"
const CHUTE = "m.box(0.8, 2, 0.4, { at: [0, 1, -0.8], color: 'blue' })\nm.box(0.8, 0.06, 2, { at: [0, 1, 0.2], rot: [0.8, 0, 0], color: 'lightblue' })\nreturn { carry: 'no', solid: true }"

function sim(layout: { kind: string; x: number; z: number; fixed?: boolean; yaw?: number }[] = []) {
  const library = newLibrary()
  for (const [id, code] of [['mat', MAT], ['tower', TOWER], ['table', TABLE], ['strip', STRIP], ['chute', CHUTE], ['cart', CART]] as const) expect(library.addItem(itemEntry(id, code))).toEqual({ ok: true })
  return makeSim({ library, actors: 2, layouts: { playground: layout } })
}

type Sim = ReturnType<typeof sim>
const find = (s: Sim, kind: string) => s.world.items.find((it) => it.kind === kind)!
const handle = (s: Sim, it: Item): ItemApi => s.api.items.find((h) => h.id === it.id)!
const alice = (s: Sim) => s.world.actors.find((a) => a.id === 'alice')!
const topY = (s: Sim, it: Item) => anchorPoint(it, infoFor(s.library, it), 'top')[1]

/** Runs made code as alice's step, to its end; returns the frames' samples of what `sample` reads. */
function play(s: Sim, code: string, args: Record<string, string> = {}, sample: () => number[] = () => [], most = 40): number[][] {
  const id = `try-${Math.random().toString(36).slice(2, 8)}`
  const params = Object.keys(args).map((name) => ({ name, kind: 'thing' as const, about: name, optional: true }))
  expect(s.library.addAction(actionEntry(id, params, code))).toEqual({ ok: true })
  s.give('alice', [step(id, args)], true)
  const out: number[][] = []
  const events = runUntil(s, 'done', 'alice', most, () => out.push(sample()))
  expect(events.filter((e) => e.type === 'failed')).toEqual([])
  return out
}

describe('up on a thing', () => {
  it('gets onto a low thing and stays there; a jump and a back flip up there land on it again', () => {
    const s = sim([{ kind: 'mat', x: 3, z: -3 }])
    const mat = find(s, 'mat')
    const a = alice(s)
    const top = topY(s, mat)
    // While the flip turns her, where she is: [y, distance from the mat's middle, pitch].
    const samples = play(
      s,
      'const t = args.thing\nyield* me.climbOnto(t)\nyield* me.jump(1)\nyield* me.flip("backflip")\nyield* me.flip("somersault")\nyield* me.flip("cartwheel")',
      { thing: mat.id },
      () => [a.y, Math.hypot(a.x - mat.x, a.z - mat.z), Math.abs(a.pitch) + Math.abs(a.roll)],
    )
    expect(a.y).toBeCloseTo(top, 3)
    expect(Math.hypot(a.x - mat.x, a.z - mat.z)).toBeLessThan(0.9)
    expect(a.on).toBe(mat.id)
    // Every turn of every flip was over the mat and above its top.
    const turning = samples.filter(([, , turn]) => turn! > 0.3)
    expect(turning.length).toBeGreaterThan(30)
    for (const [y, d] of turning) {
      expect(d).toBeLessThan(0.9)
      expect(y).toBeGreaterThan(top - 0.01)
    }
    // When the step is over she stays up there.
    run(s, 2)
    expect(a.y).toBeCloseTo(top, 3)
  })

  it('climbs a thing higher than itself, stands on its top, and climbs down beside it', () => {
    const s = sim([{ kind: 'tower', x: -3, z: -3 }])
    const tower = find(s, 'tower')
    const a = alice(s)
    play(s, 'yield* me.climbOnto(args.thing)\nme.say(String(me.onTop ? me.onTop.kind : "none"))', { thing: tower.id })
    expect(a.y).toBeCloseTo(2.2, 2)
    expect(a.bubble?.text).toBe('tower')
    play(s, 'yield* me.climbDown({ x: 3, z: 3 })', {})
    expect(a.y).toBeCloseTo(0, 3)
    expect(a.on ?? null).toBe(null)
    // On the side toward the place asked, outside the tower.
    expect(Math.hypot(a.x - tower.x, a.z - tower.z)).toBeGreaterThan(1)
    expect(a.x).toBeGreaterThan(tower.x)
  })

  it('stands on a thing with no top of its own (the middle of its top) and on a flat thing nobody walks round', () => {
    const s = sim([{ kind: 'table', x: 2, z: 2 }, { kind: 'strip', x: -3, z: 1 }])
    const a = alice(s)
    play(s, 'yield* me.climbOnto(args.thing)\nyield* me.jump(0.5)', { thing: find(s, 'table').id })
    expect(a.y).toBeCloseTo(0.76, 2)
    play(s, 'yield* me.climbOnto(args.thing)\nyield* me.jump(0.5)', { thing: find(s, 'strip').id })
    expect(a.y).toBeCloseTo(0.1, 2)
    expect(a.on).toBe(find(s, 'strip').id)
  })

  it('walks along the top of a long thing from end to end, as it lies, and stays up there', () => {
    const s = sim([{ kind: 'strip', x: 0, z: -2, yaw: 0.6 }])
    const strip = find(s, 'strip')
    const a = alice(s)
    const off = play(s, 'yield* me.climbOnto(args.t)\nyield* me.walkTo(args.t.point(0, 1, 1))\nyield* me.walkTo(args.t.point(0, 1, -1))', { t: strip.id }, () => [a.on === strip.id ? 1 : 0, a.y])
    const end = handle(s, strip).point(0, 1, -1)
    expect(Math.hypot(a.x - end.x, a.z - end.z)).toBeLessThan(0.7)
    expect(a.on).toBe(strip.id)
    expect(a.y).toBeCloseTo(0.1, 2)
    // Once up, up all the way.
    const up = off.findIndex(([on]) => on === 1)
    for (const [on] of off.slice(up)) expect(on).toBe(1)
  })

  it('walking somewhere off the top gets down first, and arrives', () => {
    const s = sim([{ kind: 'tower', x: 0, z: -3 }])
    const a = alice(s)
    play(s, 'yield* me.climbOnto(args.thing)\nyield* me.walkTo({ x: 5, z: 3 }, { near: 0.1 })', { thing: find(s, 'tower').id })
    expect(a.y).toBeCloseTo(0, 3)
    expect(Math.hypot(a.x - 5, a.z - 3)).toBeLessThan(0.3)
    expect(a.on ?? null).toBe(null)
  })

  it('a jump off the edge of the top comes down on the ground', () => {
    const s = sim([{ kind: 'mat', x: 0, z: -3 }])
    const a = alice(s)
    play(s, 'yield* me.climbOnto(args.thing)\nyield* me.jump(0.6, 3)', { thing: find(s, 'mat').id })
    expect(a.y).toBeCloseTo(0, 3)
    expect(a.on ?? null).toBe(null)
  })

  it('a thing taken away lets it down', () => {
    const s = sim([{ kind: 'mat', x: 0, z: -3 }])
    const a = alice(s)
    const mat = find(s, 'mat')
    play(s, 'yield* me.climbOnto(args.thing)', { thing: mat.id })
    s.removeItem(mat.id)
    play(s, 'yield* me.jump(0.3)', {})
    expect(a.y).toBeCloseTo(0, 3)
  })
})

describe('moving a thing of any size', () => {
  it('carries what it can carry and puts it beside the target', () => {
    const s = sim([{ kind: 'ball', x: 4, z: 0 }, { kind: 'table', x: -4, z: -2 }])
    const ball = find(s, 'ball')
    play(s, 'yield* me.moveThing(args.thing, args.to)', { thing: ball.id, to: find(s, 'table').id })
    expect(ball.holder).toBe(null)
    expect(Math.hypot(ball.x + 4, ball.z + 2)).toBeLessThan(1.5)
  })

  it('pushes one too big to carry along the ground to a side of another, and says nothing is too big', () => {
    const s = sim([{ kind: 'bench', x: 3, z: 1 }, { kind: 'tower', x: -3, z: -3 }])
    const bench = find(s, 'bench')
    const tower = find(s, 'tower')
    const lines: string[] = []
    play(s, 'yield* me.moveThing(args.thing, args.to, "front")', { thing: bench.id, to: tower.id }, () => {
      if (alice(s).bubble) lines.push(alice(s).bubble!.text)
      return []
    })
    expect(lines).not.toContain('Too big!')
    // At the tower's front, on the ground, not fixed to it.
    expect(bench.y).toBeCloseTo(0, 1)
    expect(bench.z).toBeGreaterThan(tower.z + 0.5)
    expect(Math.abs(bench.x - tower.x)).toBeLessThan(0.2)
    expect(bench.attached ?? null).toBe(null)
  })

  it('moves one up onto another by magic and fixes it there; a thing built into the room by magic too', () => {
    const s = sim([{ kind: 'bench', x: 3, z: 1 }, { kind: 'table', x: -3, z: -3 }, { kind: 'rock', x: 4, z: -4, fixed: true }])
    const bench = find(s, 'bench')
    const table = find(s, 'table')
    play(s, 'yield* me.moveThing(args.thing, args.to, "top")', { thing: bench.id, to: table.id })
    expect(bench.attached?.to).toBe(table.id)
    expect(bench.y).toBeCloseTo(0.76, 1)
    const rock = find(s, 'rock')
    play(s, 'yield* me.moveThing(args.thing, { x: -6, z: 4 })', { thing: rock.id })
    expect(Math.hypot(rock.x + 6, rock.z - 4)).toBeLessThan(0.05)
    expect(rock.y).toBeCloseTo(0, 3)
  })
})

describe('sizing a thing to reach up to another', () => {
  it('a chute put at the tower front with up: top reaches its floor, and fixed there goes with it', () => {
    const s = sim([{ kind: 'tower', x: 0, z: -3 }])
    const tower = handle(s, find(s, 'tower'))
    const chute = s.api.make('chute', { x: 5, z: 5 })
    chute.attachTo(tower, 'front', { up: 'top' })
    const it = s.world.items.find((i) => i.id === chute.id)!
    const info = infoFor(s.library, it)
    expect(it.y + info.recipe.bounds.max[1] * it.scale).toBeCloseTo(2.2, 2)
    expect(it.z).toBeGreaterThan(-3 + 0.7)
    tower.x += 2
    run(s, 0.1)
    expect(it.x).toBeCloseTo(2, 2)
    // A height in metres too.
    const other = s.api.make('chute', { x: -5, z: 5 })
    other.putAt(tower, 'left', { up: 1 })
    expect(other.scale).toBeCloseTo(1 / 2, 2)
  })
})

describe("a step's new thing", () => {
  it("'new:kind' makes a new one even with one standing there; the kind alone is the one there", () => {
    const s = sim([{ kind: 'table', x: 0, z: -2 }])
    const there = find(s, 'table')
    const seen: string[] = []
    const id = 'look-at'
    expect(s.library.addAction(actionEntry(id, [{ name: 'thing', kind: 'item', about: 'what', optional: false }], 'me.say(args.thing.id)\nyield* w.wait(0.2)'))).toEqual({ ok: true })
    s.give('alice', [step(id, { thing: 'table' })], true)
    runUntil(s, 'done', 'alice', 5, () => alice(s).bubble && seen.push(alice(s).bubble!.text))
    s.give('alice', [step(id, { thing: 'new:table' })], true)
    runUntil(s, 'done', 'alice', 5, () => alice(s).bubble && seen.push(alice(s).bubble!.text))
    const ids = [...new Set(seen)]
    expect(ids[0]).toBe(there.id)
    expect(ids[1]).not.toBe(there.id)
    expect(s.world.items.filter((i) => i.kind === 'table')).toHaveLength(2)
    // From code too, as words: me.do gives a new one.
    const n = s.world.items.length
    const actor: ActorApi = s.api.actor('alice')!
    expect(actor).not.toBe(null)
    play(s, "yield* me.do('look-at', { thing: 'new:ball' })")
    expect(s.world.items.length).toBe(n + 1)
  })
})

describe('moving along a route, at a pace', () => {
  it("reads a thing's box in its own frame, turned as the thing is", () => {
    const s = sim([{ kind: 'strip', x: 1, z: -2, yaw: Math.PI / 2 }])
    const strip = handle(s, find(s, 'strip'))
    // The strip is 3 m long along its own z; turned a quarter, its front end is 1.5 m toward +x, its top 0.1 m up.
    const front = strip.point(0, 1, 1)
    expect(front.x).toBeCloseTo(2.5, 2)
    expect(front.z).toBeCloseTo(-2, 2)
    expect(front.y).toBeCloseTo(0.1, 2)
    const back = strip.point(0, -1, -1)
    expect(back.x).toBeCloseTo(-0.5, 2)
    expect(back.y).toBeCloseTo(0, 2)
  })

  it('a thing goes along a route worked out from another thing, and whoever stands on it goes along', () => {
    const s = sim([{ kind: 'strip', x: 0, z: -3 }, { kind: 'cart', x: 4, z: 2 }])
    const strip = find(s, 'strip')
    const cart = find(s, 'cart')
    const a = alice(s)
    const gaps = play(
      s,
      'const t = args.track\nyield* me.moveThing(args.cart, [t.point(0, 1, -1), t.point(0, 1, -1)])\nyield* me.climbOnto(args.cart)\nyield* me.moveThing(args.cart, [t.point(0, 1, -1), t.point(0, 1, 1)], null, { speed: 1.5 })',
      { track: strip.id, cart: cart.id },
      () => [a.on === cart.id ? Math.hypot(a.x - cart.x, a.z - cart.z) : -1, a.on === cart.id ? a.y - cart.y : -1],
    )
    // It ended at the strip's front end, on its top, facing along it.
    expect(cart.x).toBeCloseTo(0, 1)
    expect(cart.z).toBeCloseTo(-1.5, 1)
    expect(cart.y).toBeCloseTo(0.1, 2)
    // She stood on it all the way and is on it still.
    const aboard = gaps.filter(([d]) => d >= 0)
    expect(aboard.length).toBeGreaterThan(60)
    for (const [d] of aboard) expect(d).toBeLessThan(0.6)
    expect(a.on).toBe(cart.id)
    expect(Math.hypot(a.x - cart.x, a.z - cart.z)).toBeLessThan(0.6)
  })

  it('a ridden thing carries its rider along its route; one moved by code carries whoever stands on it too', () => {
    const s = sim([{ kind: 'cart', x: -4, z: 2 }, { kind: 'mat', x: 3, z: -3 }])
    const cart = find(s, 'cart')
    const a = alice(s)
    // Once the cart is on its way (the hop onto its seat is over), the rider is in its seat.
    const riding = play(s, 'yield* me.ride(args.cart)\nyield* me.moveThing(args.cart, [{ x: -4, z: -2 }, { x: 4, z: -2 }], null, { speed: 2 })\nme.say(me.riding ? "on" : "off")', { cart: cart.id }, () => [a.riding === cart.id ? Math.hypot(a.x - cart.x, a.z - cart.z) : -1, cart.z])
    expect(a.bubble?.text).toBe('on')
    expect(Math.hypot(cart.x - 4, cart.z + 2)).toBeLessThan(0.05)
    const going = riding.filter(([d, z]) => d >= 0 && z! < 1.5)
    expect(going.length).toBeGreaterThan(100)
    for (const [d] of going) expect(d).toBeLessThan(0.3)
    // Turned with it: it faces +x at the end of its way along x.
    expect(Math.abs(Math.sin(cart.yaw) - 1)).toBeLessThan(0.05)
    const mat = find(s, 'mat')
    const x0 = mat.x
    play(s, 'yield* me.climbOnto(args.mat)\nconst m = args.mat\nconst x = m.x\nyield* w.during(1, (k) => { m.x = x - 2 * k; m.yaw = k })', { mat: mat.id })
    expect(mat.x).toBeCloseTo(x0 - 2, 2)
    expect(Math.hypot(a.x - mat.x, a.z - mat.z)).toBeLessThan(0.6)
    expect(a.y).toBeCloseTo(topY(s, mat), 2)
  })

  it('one point at a time goes the same way, with a pace or with someone aboard, as code writes it a leg at a time', () => {
    const s = sim([{ kind: 'cart', x: -4, z: 2 }])
    const cart = find(s, 'cart')
    const a = alice(s)
    play(s, 'yield* me.climbOnto(args.cart)\nyield* me.moveThing(args.cart, [-4, -2], null, { speed: 1.5 })\nyield* me.moveThing(args.cart, [2, -2])', { cart: cart.id })
    expect(Math.hypot(cart.x - 2, cart.z + 2)).toBeLessThan(0.05)
    expect(a.on).toBe(cart.id)
    expect(Math.hypot(a.x - cart.x, a.z - cart.z)).toBeLessThan(0.6)
  })

  it('walks a route of points at its own pace', () => {
    const s = sim()
    const a = alice(s)
    const points = [{ x: -3, z: 0 }, { x: 3, z: 0 }, { x: 3, z: -4 }]
    const near = points.map(() => Infinity)
    const timed = (code: string) => {
      const t0 = s.world.t
      play(s, code, {}, () => {
        points.forEach((p, i) => (near[i] = Math.min(near[i]!, Math.hypot(a.x - p.x, a.z - p.z))))
        return []
      })
      return s.world.t - t0
    }
    const slow = timed('yield* me.walkTo([{ x: -3, z: 0 }, { x: 3, z: 0 }, { x: 3, z: -4 }], { near: 0.1 })')
    for (const d of near) expect(d).toBeLessThan(0.3)
    expect(Math.hypot(a.x - 3, a.z + 4)).toBeLessThan(0.3)
    a.x = -3
    a.z = 0
    const fast = timed('yield* me.walkTo([{ x: 3, z: 0 }, { x: 3, z: -4 }], { near: 0.1, speed: 4 })')
    expect(fast).toBeLessThan(slow / 2)
  })
})
