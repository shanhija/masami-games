/**
 * The sim, one rule at a time on a small world with just the things under test: walking round
 * a rock, carrying, dropping, throwing, jumping, riding, wearing, made code that works, fails
 * or loops, numbers code broke, floating, thinking until an action is made, rooms.
 */
import { describe, expect, it, vi } from 'vitest'

import type { ItemApi } from './api'
import { handFrame, pointIn, proportions, rootFrame } from './body'
import { inWater, ROOM_GEO, WATER_Y } from './rooms'
import { createWorld, newActor, Sim } from './sim'
import { parseColor } from './kit'
import type { Param } from './protocol'
import { actionEntry, itemEntry, kidLook, makeSim, newLibrary, run, runUntil, step } from './testing'
import { restPart, ROOM_HALF, STEP, type Item } from './types'
import { anchorPoint, CAMERA_FACING } from './world'

const actor = (sim: Sim, id: string) => sim.world.actors.find((a) => a.id === id)!
const itemOf = (sim: Sim, kind: string): Item => sim.world.items.find((it) => it.kind === kind)!
const handle = (sim: Sim, it: Item): ItemApi => sim.api.items.find((h) => h.id === it.id)!

describe('createWorld', () => {
  it('places every room’s things with ids from 1 and the actors on the spawn spots facing the camera’s side', () => {
    const sim = makeSim({
      actors: 3,
      layouts: {
        playground: [{ kind: 'ball', x: 2, z: 0 }, { kind: 'bench', x: -4, z: -4, fixed: true, yaw: 1 }],
        pool: [{ kind: 'ball', x: 0, z: -3 }, { kind: 'bench', x: 8, z: 8, fixed: true }],
        forest: [{ kind: 'rock', x: 1, z: 1, fixed: true, tint: '#ff0000' }],
      },
    })
    const w = sim.world
    expect(w.items.map((it) => it.id)).toEqual(['#i1', '#i2'])
    expect(w.items[1]).toMatchObject({ kind: 'bench', fixed: true, yaw: 1, loose: false, y: 0 })
    expect(w.away.pool.map((it) => it.id)).toEqual(['#i3', '#i4'])
    // A loose thing put in the pool floats there.
    expect(w.away.pool[0]).toMatchObject({ loose: true, y: WATER_Y })
    expect(w.away.forest[0]).toMatchObject({ id: '#i5', tint: '#ff0000' })
    expect(w.away.playground).toEqual([])
    expect(w.nextId).toBe(6)
    expect(w.actors.map((a) => [a.x, a.z, a.yaw])).toEqual(ROOM_GEO.playground.spawn.slice(0, 3).map((s) => [s.x, s.z, 0]))
    expect(structuredClone(w)).toEqual(w)
  })
})

describe('moving', () => {
  it('walks to a place round a rock in the way', () => {
    const sim = makeSim({ layouts: { playground: [{ kind: 'rock', x: -3, z: 0, fixed: true }] } })
    const alice = actor(sim, 'alice')
    const rock = itemOf(sim, 'rock')
    const clear = sim.library.info('rock').radius + proportions(alice.look).radius
    let closest = Infinity
    sim.give('alice', [step('walk', { target: '-3,-4' })], true)
    runUntil(sim, 'done', 'alice', 15, () => {
      closest = Math.min(closest, Math.hypot(alice.x - rock.x, alice.z - rock.z))
    })
    expect(Math.hypot(alice.x + 3, alice.z + 4)).toBeLessThan(0.15)
    expect(closest).toBeGreaterThan(clear - 0.05)
    expect(alice.pose.legL.swing).toBeCloseTo(0, 5)
  })

  it('jumps and comes back down', () => {
    const sim = makeSim()
    const alice = actor(sim, 'alice')
    let top = 0
    sim.give('alice', [step('jump')], true)
    runUntil(sim, 'done', 'alice', 5, () => {
      top = Math.max(top, alice.y)
    })
    expect(top).toBeGreaterThan(0.5)
    expect(top).toBeLessThan(0.7)
    expect(alice.y).toBe(0)
    expect(alice.pose.squash).toBe(1)
  })
})

describe('carrying', () => {
  it('picks a thing up, and it follows the hand', () => {
    const sim = makeSim({ layouts: { playground: [{ kind: 'ball', x: -3, z: 2 }] } })
    const alice = actor(sim, 'alice')
    const ball = itemOf(sim, 'ball')
    sim.give('alice', [step('pick-up', { thing: 'pallo' })], true)
    runUntil(sim, 'done', 'alice', 6)
    expect(alice.hands).toEqual({ left: null, right: ball.id })
    expect(ball.holder).toEqual({ actor: 'alice', hand: 'right' })
    expect(ball.loose).toBe(false)
    const info = sim.library.info('ball')
    sim.give('alice', [step('walk', { target: '2,0' })], true)
    runUntil(sim, 'done', 'alice', 10, () => {
      const hand = handFrame(alice, 'right').p
      const grip = anchorPoint(ball, info, 'hand')
      for (let k = 0; k < 3; k++) expect(grip[k]).toBeCloseTo(hand[k]!, 6)
    })
  })

  it('drops a thing, which falls and comes to rest', () => {
    const sim = makeSim({ layouts: { playground: [{ kind: 'ball', x: -3, z: 2 }] } })
    const ball = itemOf(sim, 'ball')
    sim.give('alice', [step('pick-up', { thing: 'ball' }), step('drop')], true)
    runUntil(sim, 'done', 'alice', 6)
    const held = ball.y
    runUntil(sim, 'done', 'alice', 2)
    expect(held).toBeGreaterThan(0.2)
    expect(ball.holder).toBe(null)
    expect(actor(sim, 'alice').hands.right).toBe(null)
    run(sim, 3)
    expect(ball.loose).toBe(false)
    expect(ball.y).toBeCloseTo(0, 3)
  })

  it('hugs a big box with both arms', () => {
    const sim = makeSim({ layouts: { playground: [{ kind: 'box', x: -3, z: 2 }] } })
    const alice = actor(sim, 'alice')
    sim.give('alice', [step('pick-up', { thing: 'box' })], true)
    runUntil(sim, 'done', 'alice', 6)
    const box = itemOf(sim, 'box')
    expect(alice.hands).toEqual({ left: box.id, right: box.id })
    // Its middle at the chest, in front of her.
    expect(box.y + 0.3).toBeGreaterThan(0.5)
    expect((box.x - alice.x) * Math.sin(alice.yaw) + (box.z - alice.z) * Math.cos(alice.yaw)).toBeGreaterThan(0.3)
    expect(alice.pose.armL.swing).toBeGreaterThan(0.8)
  })

  it('throws a ball at someone: one hit, and it lands near them', () => {
    const sim = makeSim({ layouts: { playground: [{ kind: 'ball', x: -3, z: 3 }] } })
    const steve = actor(sim, 'steve')
    steve.x = 3
    steve.z = -2
    const ball = itemOf(sim, 'ball')
    sim.give('alice', [step('throw', { thing: 'ball', target: 'steve' })], true)
    let atHit: number | null = null
    const events = runUntil(sim, 'done', 'alice', 12, () => {
      if (atHit === null && sim.world.events.some((e) => e.type === 'hit')) atHit = Math.hypot(ball.x - steve.x, ball.z - steve.z)
    })
    const hits = events.filter((e) => e.type === 'hit')
    expect(hits).toEqual([{ type: 'hit', item: ball.id, actor: 'steve' }])
    expect(atHit).toBeLessThan(0.6)
    run(sim, 4)
    expect(ball.loose).toBe(false)
    expect(Math.hypot(ball.x - steve.x, ball.z - steve.z)).toBeLessThan(3)
  })

  it('throws to land on a spot', () => {
    const sim = makeSim({ layouts: { playground: [{ kind: 'ball', x: -3, z: 3 }] } })
    const ball = itemOf(sim, 'ball')
    const time = sim.api.throw(handle(sim, ball), { x: 4, z: -3 })
    expect(time).toBeGreaterThan(0.5)
    let landed: [number, number, number] | null = null
    let t = 0
    for (let i = 0; i < 300 && landed === null; i++) {
      sim.step()
      t += STEP
      if (ball.y < 0.005) landed = [ball.x, ball.z, t]
    }
    expect(landed).not.toBe(null)
    expect(Math.hypot(landed![0] - 4, landed![1] + 3)).toBeLessThan(0.3)
    expect(landed![2]).toBeCloseTo(time, 1)
  })
})

describe('riding and wearing', () => {
  it('rides a bike the action moves, hips on the seat inside the frame part, and stays on until the next command', () => {
    const sim = makeSim({ layouts: { playground: [{ kind: 'bike', x: -3, z: 2 }] } })
    const alice = actor(sim, 'alice')
    const bike = itemOf(sim, 'bike')
    const info = sim.library.info('bike')
    const hipY = proportions(alice.look).hipY
    let seated = 0
    sim.give('alice', [step('ride', { thing: 'bike' })], true)
    runUntil(sim, 'done', 'alice', 10, () => {
      if (alice.riding === null || sim.side.hopping.has('alice')) return
      const hips = pointIn(rootFrame(alice), [0, hipY, 0])
      const seat = anchorPoint(bike, info, 'seat')
      for (let k = 0; k < 3; k++) expect(hips[k]).toBeCloseTo(seat[k]!, 2)
      seated++
    })
    expect(seated).toBeGreaterThan(100)
    expect(bike.z).toBeCloseTo(2 + 3 + (bike.z - 5), 6)
    expect(bike.z).toBeGreaterThan(4.5)
    expect(alice.z).toBeGreaterThan(4.3)
    expect(bike.parts.wheelFront!.rx).not.toBe(0)
    run(sim, 1)
    expect(alice.riding).toBe(bike.id)
    expect(bike.rider).toBe('alice')
    sim.give('alice', [step('walk', { target: '0,0' })], true)
    runUntil(sim, 'done', 'alice', 10)
    expect(alice.riding).toBe(null)
    expect(bike.rider).toBe(null)
    expect(Math.hypot(alice.x, alice.z)).toBeLessThan(0.2)
  })

  it('sits on a bench and on the ground, and keeps sitting', () => {
    const sim = makeSim({ layouts: { playground: [{ kind: 'bench', x: -3, z: 1, fixed: true }] } })
    const alice = actor(sim, 'alice')
    sim.give('alice', [step('sit', { thing: 'bench' })], true)
    runUntil(sim, 'done', 'alice', 8)
    run(sim, 2)
    expect(alice.riding).toBe(itemOf(sim, 'bench').id)
    expect(alice.y).toBeCloseTo(0.49 - proportions(alice.look).hipY, 2)
    expect(alice.pose.legL.swing).toBeGreaterThan(1.3)
    sim.give('steve', [step('sit')], true)
    runUntil(sim, 'done', 'steve', 3)
    run(sim, 2)
    expect(actor(sim, 'steve').pose.bob).toBeLessThan(-0.3)
  })

  it('wears a hat as part of the look and takes it off as a loose thing again', () => {
    const sim = makeSim({ layouts: { playground: [{ kind: 'hat', x: -3, z: 3 }] } })
    const alice = actor(sim, 'alice')
    sim.give('alice', [step('wear', { thing: 'hattu' })], true)
    runUntil(sim, 'done', 'alice', 6)
    expect(alice.look.worn.head).toEqual({ kind: 'hat', tint: null })
    expect(sim.world.items.some((it) => it.kind === 'hat')).toBe(false)
    expect(alice.hands).toEqual({ left: null, right: null })
    sim.give('alice', [step('take-off', { slot: 'head' })], true)
    runUntil(sim, 'done', 'alice', 2)
    expect(alice.look.worn.head).toBe(undefined)
    const hat = itemOf(sim, 'hat')
    expect(hat.loose).toBe(true)
    run(sim, 3)
    expect(hat.loose).toBe(false)
    // Worn things are built round the head's middle: the hat's brim is 0.19 above its origin, and the brim rests on the ground.
    expect(hat.y + sim.library.info('hat').recipe.bounds.min[1]).toBeCloseTo(0, 3)
  })

  it('puts a new thing on over an old one: the old one goes in a sparkle, not to the ground', () => {
    const sim = makeSim({ layouts: { playground: [{ kind: 'hat', x: -3, z: 3 }] } })
    const alice = actor(sim, 'alice')
    alice.look.worn.head = { kind: 'hat', tint: '#ff0000' }
    sim.give('alice', [step('wear', { thing: 'hattu' })], true)
    runUntil(sim, 'done', 'alice', 6)
    expect(alice.look.worn.head).toEqual({ kind: 'hat', tint: null })
    expect(sim.world.items.some((it) => it.kind === 'hat')).toBe(false)
    expect(sim.world.puffs.some((p) => p.kind === 'spark')).toBe(true)
  })
})

describe('made code', () => {
  it('runs a guarded made action to done, in the spotlight', () => {
    const sim = makeSim()
    expect(sim.library.addAction(actionEntry('wave-twice', [], "__g();me.say('Hi!')\nfor (let i = 0; i < 2; i++) {__g();\n  yield* me.poseTo({ armR: { swing: 2.5 } }, 0.2)\n  yield* me.rest(0.2)\n}"))).toEqual({ ok: true })
    sim.give('alice', [step('wave-twice')], true)
    sim.step()
    expect(sim.world.spotlight).toBe('alice')
    const events = runUntil(sim, 'done', 'alice', 3)
    expect(events.map((e) => e.type)).toEqual(['started', 'done'])
    expect(sim.world.spotlight).toBe(null)
    expect(actor(sim, 'alice').bubble?.text).toBe('Hi!')
  })

  it('does a library action inside another with me.do: its args as things or words, by id or a word for it, and three deep at most', () => {
    const sim = makeSim({ layouts: { playground: [{ kind: 'ball', x: 2, z: 2 }] } })
    // A script for this moment: pick the ball up by the library's own action, given as a word and as the thing itself.
    sim.library.addAction(actionEntry('moment', [], "__g();yield* me.do('ota', { thing: 'ball' })\nyield* me.do('drop', {})\nyield* me.do('pick-up', { thing: w.find('ball') })\nme.keep(me.holding())"))
    sim.give('alice', [step('moment')], true)
    runUntil(sim, 'done', 'alice', 20)
    expect(sim.world.items.find((i) => i.kind === 'ball')!.holder).toEqual({ actor: 'alice', hand: 'right' })
    sim.library.addAction(actionEntry('nothing', [], "__g();yield* me.do('fly-to-the-moon', {})"))
    sim.give('steve', [step('nothing')], true)
    expect(runUntil(sim, 'failed', 'steve', 2).find((e) => e.type === 'failed')).toMatchObject({ error: expect.stringContaining('there is no action "fly-to-the-moon"') })
    sim.library.addAction(actionEntry('deeper', [], "__g();yield* me.do('deeper', {})"))
    sim.give('steve', [step('deeper')], true)
    expect(runUntil(sim, 'failed', 'steve', 4).find((e) => e.type === 'failed')).toMatchObject({ error: expect.stringContaining('three deep at most') })
  })

  it('takes a spot for a thing param: the room\'s water is a place to throw at, not a thing', () => {
    const sim = makeSim({ layouts: { playground: [{ kind: 'ball', x: 0, z: 2 }] } })
    sim.library.addAction(actionEntry('toss', [{ name: 'thing', kind: 'item', about: 'what', optional: false }, { name: 'target', kind: 'thing', about: 'where', optional: true }], "__g();me.say(args.target && !args.target.isActor && args.target.id === undefined ? 'spot ' + args.target.x + ',' + args.target.z : 'none')"))
    sim.give('alice', [step('toss', { thing: 'ball', target: '6.5,-6.5' })], true)
    runUntil(sim, 'done', 'alice', 2)
    expect(actor(sim, 'alice').bubble?.text).toBe('spot 6.5,-6.5')
  })

  it('ends a made action that throws with a failed event and a shrug', () => {
    const sim = makeSim()
    sim.library.addAction(actionEntry('oops', [], '__g();yield* w.wait(0.1)\nconst thing = null\nthing.boom()'))
    sim.give('alice', [step('oops')], true)
    const events = runUntil(sim, 'failed', 'alice', 2)
    const failed = events.find((e) => e.type === 'failed')
    expect(failed).toMatchObject({ actor: 'alice', error: "TypeError: Cannot read properties of null (reading 'boom') (line 3)" })
    sim.step()
    expect(actor(sim, 'alice').bubble?.text).toBe('Hmm?')
    expect(sim.reacting('alice')).toBe(true)
    run(sim, 2)
    expect(sim.reacting('alice')).toBe(false)
  })

  it('stops a made action that loops without yield, and the sim goes on', () => {
    const sim = makeSim()
    sim.library.addAction(actionEntry('forever', [], 'while (true) {__g(); }'))
    sim.give('alice', [step('forever')], true)
    sim.give('steve', [step('walk', { target: '0,0' })], true)
    const events = runUntil(sim, 'done', 'steve', 6)
    expect(events.find((e) => e.type === 'failed')).toMatchObject({ actor: 'alice', error: 'GuardError: a loop ran too long without yield (line 1)' })
    expect(Math.hypot(actor(sim, 'steve').x, actor(sim, 'steve').z)).toBeLessThan(0.2)
  })

  it('cleans up NaN, bad colours and huge numbers that code wrote', () => {
    const sim = makeSim({ layouts: { playground: [{ kind: 'ball', x: 2, z: 2 }, { kind: 'bike', x: 4, z: 2 }] } })
    sim.library.addAction(
      actionEntry(
        'break',
        [],
        [
          "__g();const ball = w.find('ball')",
          "const bike = w.find('bike')",
          'me.pose.lean = NaN',
          'me.pose.armL = null',
          'me.pose.head.turn = Infinity',
          'me.pose.squash = 50',
          'me.pose.twist = 100',
          'me.pose.extra = () => 1',
          "me.look.top = 'not a colour'",
          "me.look.bottom = 'Constructor'",
          "me.look.eyes = '__proto__'",
          "me.look.shoes = 'pink'",
          "me.look.worn.head = 'crown'",
          'me.x = 1e9',
          'me.yaw = NaN',
          'ball.state.n = NaN',
          'ball.state.ok = 3',
          'ball.state.f = function () {}',
          "ball.part('nope').x = NaN",
          "bike.part('frame').rx = NaN",
          "bike.part('wheelFront').s = 1e9",
          'ball.y = Infinity',
          'me.say(undefined)',
          'yield',
          'me.pose = { lean: 0.3 }',
          'yield',
        ].join('\n'),
      ),
    )
    const alice = actor(sim, 'alice')
    const yaw = alice.yaw
    sim.give('alice', [step('break')], true)
    sim.step()
    expect(alice.pose.lean).toBe(0)
    expect(alice.pose.armL).toEqual({ swing: 0, raise: 0, bend: 0 })
    expect(alice.pose.head.turn).toBe(0)
    expect(alice.pose.squash).toBe(2)
    expect(alice.pose.twist).toBeCloseTo(100 % (2 * Math.PI), 6)
    expect('extra' in alice.pose).toBe(false)
    expect(alice.look.top).toBe('#9b5fd3')
    // Not Object's own fields either: a look holding one could not be copied for validation.
    expect(alice.look.bottom).toBe('#4a78e0')
    expect(alice.look.eyes).toBe('#3a2a20')
    expect(alice.look.shoes).toBe('#ff9ccf')
    expect(alice.look.worn.head).toEqual({ kind: 'crown', tint: null })
    expect(alice.x).toBe(ROOM_HALF)
    expect(alice.yaw).toBe(yaw)
    const ball = itemOf(sim, 'ball')
    expect(ball.state).toEqual({ ok: 3 })
    expect(Number.isFinite(ball.y)).toBe(true)
    expect(itemOf(sim, 'bike').parts).toEqual({ frame: restPart(), wheelFront: { ...restPart(), s: 20 } })
    expect(alice.bubble).toBe(null)
    sim.step()
    expect(alice.pose.lean).toBe(0.3)
    expect(structuredClone(sim.world)).toEqual(sim.world)
  })

  it('runs a helper that code yields instead of yield*-ing', () => {
    const sim = makeSim()
    sim.library.addAction(actionEntry('hop', [], '__g();yield me.jump(0.5)\nyield me.walkTo({ x: 0, z: 0 }, { near: 0.1 })'))
    const alice = actor(sim, 'alice')
    let top = 0
    sim.give('alice', [step('hop')], true)
    runUntil(sim, 'done', 'alice', 8, () => {
      top = Math.max(top, alice.y)
    })
    expect(top).toBeGreaterThan(0.4)
    expect(Math.hypot(alice.x, alice.z)).toBeLessThan(0.15)
  })

  it('moves another actor only while joined, and lets it go when the action ends', () => {
    const sim = makeSim()
    sim.library.addAction(actionEntry('lead', [{ name: 'friend', kind: 'actor', about: '', optional: false }], "__g();const f = args.friend\nyield* w.together(me.walkTo({ x: 0, z: 0 }), f.walkTo({ x: 1, z: 0 }))\nyield* f.jump(0.4)"))
    sim.give('steve', [step('walk', { target: '-1,-6' })], true)
    sim.step()
    sim.give('alice', [step('lead', { friend: 'stive' })], true)
    sim.step()
    const steve = actor(sim, 'steve')
    expect(steve.joinedBy).toBe('alice')
    runUntil(sim, 'done', 'alice', 10)
    expect(Math.hypot(steve.x - 1, steve.z)).toBeLessThan(0.7)
    expect(steve.joinedBy).toBe(null)
    // Steve's own walk goes on from there.
    runUntil(sim, 'done', 'steve', 10)
    expect(Math.hypot(steve.x + 1, steve.z + 6)).toBeLessThan(0.2)
  })

  it('takes another in with w.join as a command would: what it was doing ends, sitting it gets up, and after it is free', () => {
    const sim = makeSim({ actors: 3, layouts: { playground: [{ kind: 'bench', x: 3, z: 3, fixed: true }] } })
    sim.library.addAction(actionEntry('gather', [], "__g();for (const f of w.actors) if (f !== me) w.join(f)\nyield* w.together(...w.actors.filter((f) => f !== me).map((f, i) => f.walkTo({ x: -2 + i, z: -3 }, { near: 0.1 })))\nyield* w.wait(0.5)"))
    sim.give('mike', [step('sit', { thing: 'bench' })], true)
    runUntil(sim, 'done', 'mike', 10)
    sim.give('steve', [step('walk', { target: '6,6' }), step('jump')], true)
    sim.step()
    const steve = actor(sim, 'steve')
    const mike = actor(sim, 'mike')
    expect(mike.riding).not.toBeNull()
    sim.give('alice', [step('gather')], true)
    const events = run(sim, 0.1)
    // Steve's walk is over (and his jump will not come), Mike is off the bench.
    expect(events.some((e) => e.type === 'done' && e.actor === 'steve' && e.step.action === 'walk')).toBe(true)
    expect(steve.doing).toBeNull()
    expect(steve.queue).toEqual([])
    expect(steve.joinedBy).toBe('alice')
    runUntil(sim, 'done', 'alice', 10)
    expect(mike.riding).toBeNull()
    expect(Math.hypot(steve.x + 2, steve.z + 3)).toBeLessThan(0.3)
    expect(Math.hypot(mike.x + 1, mike.z + 3)).toBeLessThan(0.3)
    expect([steve.joinedBy, mike.joinedBy]).toEqual([null, null])
    const after = run(sim, 2)
    expect(after.filter((e) => e.type === 'started')).toEqual([])
    expect(Math.hypot(steve.x + 2, steve.z + 3)).toBeLessThan(0.3)
  })

  it('lets a joined actor go when the child tells it something, and the action cannot take it back', () => {
    const sim = makeSim()
    sim.library.addAction(
      actionEntry('herd', [{ name: 'friend', kind: 'actor', about: '', optional: false }], "__g();const f = args.friend\nw.join(f)\nyield* w.until(() => f.busy, 6)\nme.say(f.busy ? 'out' : 'in')\nyield* f.walkTo({ x: 5, z: -5 })\nf.x = 5\nyield* w.wait(1)"),
    )
    sim.give('alice', [step('herd', { friend: 'steve' })], true)
    run(sim, 1)
    const steve = actor(sim, 'steve')
    expect(steve.joinedBy).toBe('alice')
    sim.give('steve', [step('jump')], true)
    expect(steve.joinedBy).toBeNull()
    const events = runUntil(sim, 'done', 'steve', 3)
    expect(events.some((e) => e.type === 'started' && e.actor === 'steve' && e.step.action === 'jump')).toBe(true)
    expect(actor(sim, 'alice').bubble?.text).toBe('out')
    // Its walk and its setting of x no longer take him in.
    run(sim, 0.5, () => expect(steve.joinedBy).toBeNull())
    // A stop does the same, and a reaction (the child spoke to it).
    for (const leave of [(s: Sim) => s.stop('steve'), (s: Sim) => s.react('steve', 'huh')]) {
      const s = makeSim()
      s.library.addAction(actionEntry('hold', [{ name: 'friend', kind: 'actor', about: '', optional: false }], '__g();w.join(args.friend)\nyield* w.wait(5)'))
      s.give('alice', [step('hold', { friend: 'steve' })], true)
      run(s, 0.5)
      expect(actor(s, 'steve').joinedBy).toBe('alice')
      leave(s)
      expect(actor(s, 'steve').joinedBy).toBeNull()
    }
  })
})

describe('the world', () => {
  it('floats a ball dropped over the pool', () => {
    const sim = makeSim({ room: 'pool' })
    const ball = sim.makeItem('ball', { x: 0, z: -3, y: 2 })
    expect(ball.loose).toBe(true)
    run(sim, 6)
    expect(inWater('pool', ball.x, ball.z)).toBe(true)
    expect(Math.abs(ball.y + sim.library.info('ball').recipe.bounds.min[1] - WATER_Y)).toBeLessThan(0.05)
    expect(ball.loose).toBe(true)
  })

  it('thinks while a step waits for its action, then runs it when the library gets it', () => {
    const sim = makeSim()
    const alice = actor(sim, 'alice')
    sim.give('alice', [step('dance')], true)
    run(sim, 1)
    expect(alice.doing).toBe(null)
    expect(alice.thinking).toMatchObject({ about: 'dance', progress: 0 })
    expect(alice.pose.armR.bend).toBeGreaterThan(1.8)
    expect(sim.world.spotlight).toBe('alice')
    alice.thinking!.progress = 0.5
    sim.library.addAction(actionEntry('dance', [], '__g();for (let i = 0; i < 30; i++) {__g(); me.yaw += 0.2; yield }\nyield* me.rest()'))
    const events = runUntil(sim, 'done', 'alice', 3)
    expect(events.map((e) => e.type)).toEqual(['started', 'done'])
    expect(alice.thinking).toBe(null)
    expect(alice.pose.armR.bend).toBeCloseTo(0, 3)
  })

  it('drops waiting steps for an action that could not be made', () => {
    const sim = makeSim()
    const alice = actor(sim, 'alice')
    sim.give('alice', [step('fly'), step('jump'), step('fly')], true)
    run(sim, 0.5)
    expect(alice.thinking).not.toBe(null)
    sim.dropSteps('alice', 'fly')
    expect(alice.queue.map((s) => s.action)).toEqual(['jump'])
    expect(alice.thinking).toBe(null)
    const events = runUntil(sim, 'done', 'alice', 3)
    expect(events.filter((e) => e.type === 'started').map((e) => e.type === 'started' && e.step.action)).toEqual(['jump'])
  })

  it('keeps each room’s things when everybody goes to another room, and brings what they hold', () => {
    const sim = makeSim({
      layouts: {
        playground: [{ kind: 'ball', x: 2, z: 0 }, { kind: 'box', x: -3, z: 2 }],
        pool: [{ kind: 'hat', x: 8, z: 8 }],
      },
    })
    sim.give('alice', [step('pick-up', { thing: 'box' })], true)
    runUntil(sim, 'done', 'alice', 6)
    const ball = itemOf(sim, 'ball')
    ball.x = 2.5
    sim.give('steve', [step('walk', { target: '5,5' })], true)
    run(sim, 0.5)
    sim.enterRoom('pool')
    expect(sim.world.room).toBe('pool')
    expect(sim.world.items.map((it) => it.kind).sort()).toEqual(['box', 'hat'])
    expect(sim.world.away.playground.map((it) => it.kind)).toEqual(['ball'])
    expect(sim.world.actors.map((a) => [a.x, a.z])).toEqual(ROOM_GEO.pool.spawn.slice(0, 2).map((s) => [s.x, s.z]))
    expect(actor(sim, 'steve').doing).toBe(null)
    run(sim, 1)
    expect(itemOf(sim, 'box').holder?.actor).toBe('alice')
    sim.enterRoom('playground')
    expect(sim.world.items.map((it) => it.kind).sort()).toEqual(['ball', 'box'])
    expect(itemOf(sim, 'ball')).toBe(ball)
    expect(ball.x).toBe(2.5)
    expect(sim.world.away.pool.map((it) => it.kind)).toEqual(['hat'])
  })

  it('makes a thing for an item word when there is none, and a mystery box for a word nobody made', () => {
    const sim = makeSim()
    sim.library.addAction(actionEntry('summon', [{ name: 'thing', kind: 'item', about: '', optional: false }], "__g();const m = w.make('unicorn')\nme.say(m.kind)\nyield"))
    sim.give('alice', [step('pick-up', { thing: 'pallon' })], true)
    runUntil(sim, 'done', 'alice', 6)
    const alice = actor(sim, 'alice')
    expect(sim.world.items.find((it) => it.kind === 'ball')?.holder?.actor).toBe('alice')
    sim.give('alice', [step('pick-up', { thing: 'zebra' })], true)
    const events = runUntil(sim, 'done', 'alice', 2)
    expect(events.some((e) => e.type === 'failed')).toBe(false)
    sim.give('alice', [step('summon')], true)
    runUntil(sim, 'done', 'alice', 2)
    expect(alice.bubble?.text).toBe('unicorn')
    expect(sim.library.info('unicorn').recipe.shapes.length).toBeGreaterThan(10)
  })

  it('ends a step after 60 seconds', () => {
    const sim = makeSim()
    sim.library.addAction(actionEntry('forever', [], 'while (true) {__g(); me.yaw += 0.01; yield }'))
    sim.give('alice', [step('forever')], true)
    run(sim, 59.9)
    expect(actor(sim, 'alice').doing?.action).toBe('forever')
    const events = run(sim, 0.2)
    expect(events.filter((e) => e.actor === 'alice').map((e) => e.type)).toEqual(['done'])
  })

  it('takes away the process of a kind that throws three times, and runs one that works', () => {
    const sim = makeSim()
    const entry = (id: string, tick: string) => ({ ...itemEntry(id, "__g();m.box(0.3, 0.3, 0.3, { at: [0, 0.15, 0], color: 'red' })"), tick, tickGuarded: `function __tick(it, w, dt) {\n${tick}\n}` })
    expect(sim.library.addItem(entry('bad-lamp', '__g();it.state.n = (it.state.n || 0) + 1\nnull.x = 1'))).toEqual({ ok: true })
    expect(sim.library.addItem(entry('good-lamp', "__g();it.state.t = (it.state.t || 0) + dt\nit.part('nope').x = 1"))).toEqual({ ok: true })
    const bad = sim.makeItem('bad-lamp', { x: 2, z: 0 })
    const good = sim.makeItem('good-lamp', { x: 4, z: 0 })
    run(sim, 1)
    expect(bad.state.n).toBe(3)
    expect(good.state.t).toBeCloseTo(1, 6)
  })

  it('turns an idle actor toward the camera after a while, and a listening one at once', () => {
    const sim = makeSim()
    const alice = actor(sim, 'alice')
    const steve = actor(sim, 'steve')
    alice.yaw = 2.5
    steve.yaw = 2.5
    run(sim, 3)
    expect(alice.yaw).toBe(2.5)
    steve.listening = true
    run(sim, 2)
    expect(steve.yaw).toBeCloseTo(CAMERA_FACING, 2)
    expect(steve.pose.head.tilt).toBeGreaterThan(0.25)
    run(sim, 8)
    expect(alice.yaw).toBeCloseTo(CAMERA_FACING, 1)
    steve.listening = false
    run(sim, 1)
    expect(steve.pose.head.tilt).toBeCloseTo(0, 2)
  })

  it('pauses a step for a reaction and goes on with it after', () => {
    const sim = makeSim()
    const alice = actor(sim, 'alice')
    sim.give('alice', [step('walk', { target: '-3,-6' })], true)
    run(sim, 0.5)
    const z = alice.z
    sim.react('alice', 'huh')
    run(sim, 0.5)
    expect(alice.z).toBe(z)
    expect(alice.bubble?.text).toBe('Huh?')
    expect(alice.doing?.action).toBe('walk')
    runUntil(sim, 'done', 'alice', 12)
    expect(Math.hypot(alice.x + 3, alice.z + 6)).toBeLessThan(0.15)
  })

  it('finds, makes beside and tells touching things as the designer is told', () => {
    const sim = makeSim({ layouts: { playground: [{ kind: 'ball', x: 1, z: 0 }, { kind: 'ball', x: 5, z: 0 }, { kind: 'bench', x: -6, z: -6, fixed: true }] } })
    const w = sim.api
    const [near, far] = sim.world.items
    expect(w.find('ball', { near: { x: 0, z: 0 } })?.id).toBe(near!.id)
    expect(w.find('pallo', { near: { x: 0, z: 0 }, not: w.find('ball', { near: { x: 0, z: 0 } })! })?.id).toBe(far!.id)
    expect(w.find('dragon')).toBe(null)
    const bench = w.find('penkki')!
    const made = w.make('ball', { near: bench })
    expect(w.distance(made, bench)).toBeCloseTo(bench.radius + made.radius + 0.3, 6)
    expect(w.touching(made, bench)).toBe(false)
    made.x = bench.x + bench.radius + made.radius + 0.05
    made.z = bench.z
    expect(w.touching(made, bench)).toBe(true)
    expect(w.angleTo({ x: 0, z: 0 }, { x: 1, z: 0 })).toBeCloseTo(Math.PI / 2, 9)
    expect(w.actor('Stevelle')?.id).toBe('steve')
    expect(w.pick([])).toBe(null)
    expect(w.water(0, 0)).toBe(false)
  })

  it('advances in fixed steps, at most four a frame', () => {
    const sim = makeSim()
    sim.advance(1)
    expect(sim.world.frame).toBe(4)
    sim.advance(STEP / 2)
    expect(sim.world.frame).toBe(4)
    sim.advance(STEP / 2)
    expect(sim.world.frame).toBe(5)
  })

  it('runs a copy of the world in a fresh sim, the way the validation worker does', () => {
    const sim = makeSim({ layouts: { playground: [{ kind: 'ball', x: -3, z: 2 }, { kind: 'bike', x: 2, z: 2 }] } })
    sim.give('alice', [step('pick-up', { thing: 'ball' })], true)
    sim.give('steve', [step('ride', { thing: 'bike' })], true)
    run(sim, 1.5)
    const lib = newLibrary()
    expect(lib.addAction(actionEntry('spin', [], '__g();for (let i = 0; i < 20; i++) {__g(); me.yaw += 0.3; yield }'))).toEqual({ ok: true })
    const copy = new Sim(structuredClone(sim.world), lib)
    expect(copy.world.actors.every((a) => a.doing === null)).toBe(true)
    copy.give('alice', [step('spin')], true)
    for (let i = 0; i < 60; i++) copy.step()
    expect(copy.world.events.map((e) => e.type)).toContain('done')
    expect(copy.world.events.some((e) => e.type === 'failed')).toBe(false)
  })

  it('adds and removes actors and items cleanly', () => {
    const sim = makeSim({ layouts: { playground: [{ kind: 'bike', x: 2, z: 2 }] } })
    const ella = newActor({ id: 'ella', name: 'Ella', calls: ['ella'], pronoun: 'she', look: kidLook('#f5a13b'), x: 0, z: 3 })
    sim.addActor(ella)
    expect(() => sim.addActor(ella)).toThrow()
    sim.react('ella', 'hello')
    sim.give('ella', [step('ride', { thing: 'bike' })], false)
    runUntil(sim, 'started', 'ella', 3)
    run(sim, 2.2)
    const bike = itemOf(sim, 'bike')
    expect(ella.riding).toBe(bike.id)
    sim.removeItem(bike.id)
    expect(ella.riding).toBe(null)
    expect(() => sim.removeItem(bike.id)).toThrow()
    sim.removeActor('ella')
    expect(sim.world.actors.map((a) => a.id)).toEqual(['alice', 'steve'])
    run(sim, 1)
    expect(() => sim.give('ella', [], false)).toThrow()
  })

  it('makes a world for a cat too', () => {
    const cat = newActor({ id: 'mirri', name: 'Mirri', calls: ['kissa'], pronoun: 'it', look: { ...kidLook('#f5a13b'), body: 'cat', height: 0.5 }, x: 0, z: 0 })
    const sim = new Sim(createWorld({ room: 'forest', actors: [cat], layouts: { playground: [], pool: [], forest: [{ kind: 'ball', x: -3, z: 2 }] }, seed: 3 }), newLibrary())
    sim.give('mirri', [step('pick-up', { thing: 'ball' }), step('jump'), step('walk', { target: '6.5,-6.5' })], true)
    runUntil(sim, 'done', 'mirri', 6)
    expect(cat.hands.right).toBe(itemOf(sim, 'ball').id)
    run(sim, 12)
    // In the pond, which is deeper than a cat's legs: swimming at the surface with its head out, not on the floor out of sight.
    expect(inWater('forest', cat.x, cat.z)).toBe(true)
    expect(cat.y).toBeCloseTo(WATER_Y - 0.6 * 0.5, 2)
    expect(cat.y).toBeGreaterThan(ROOM_GEO.forest.floor + 0.05)
    expect(cat.y + 0.5).toBeGreaterThan(WATER_Y + 0.15)
  })

  it('wades a kid on the pool floor and swims a shrunk one at the surface', () => {
    const sim = makeSim({ room: 'pool' })
    const [alice, steve] = sim.world.actors
    steve!.scale = 0.5
    sim.give('alice', [step('walk', { target: '-1,-3' })], true)
    sim.give('steve', [step('walk', { target: '1,-3' })], true)
    run(sim, 8)
    expect(inWater('pool', alice!.x, alice!.z) && inWater('pool', steve!.x, steve!.z)).toBe(true)
    // The water is 0.67 deep: a kid 1.15 tall wades on the floor.
    expect(alice!.y).toBeCloseTo(ROOM_GEO.pool.floor, 2)
    // Half size, it would be under water there.
    expect(steve!.y).toBeCloseTo(WATER_Y - 0.6 * 1.15 * 0.5, 2)
    // And it climbs out onto the deck again.
    sim.give('steve', [step('walk', { target: '1,4' })], true)
    run(sim, 8)
    expect(steve!.y).toBe(0)
  })
})

describe('what the designer is told', () => {
  const thing: Param[] = [{ name: 'thing', kind: 'item', about: '', optional: true }]
  /** A wand worn in the hand whose process turns its star and sparkles at its tip, as lib1's magic wand does. */
  const wand = {
    ...itemEntry('wand', "__g();m.cylinder(0.02, 0.02, 0.4, { at: [0, 0.2, 0], color: 'brown' })\nm.part('star', { at: [0, 0.42, 0] }, () => {__g(); m.sphere(0.06, { color: 'gold', glow: true }) })\nreturn { carry: 'hand', wear: 'hand' }"),
    tick: '',
    tickGuarded: "function __tick(it, w, dt) {\n__g();it.part('star').ry += dt * 2\nit.state.n = (it.state.n || 0) + 1\nw.puff({ at: it, y: it.anchor('top').y, kind: 'spark', count: 1, speed: 0, up: 0, gravity: 0, life: 0.1 })\n}",
  }

  it('turns what it rides when it turns or sets its yaw, and does not turn while sitting on something', () => {
    const sim = makeSim({ layouts: { playground: [{ kind: 'bike', x: -3, z: 2 }, { kind: 'bench', x: 3, z: 1, fixed: true }] } })
    const turn = (how: string) =>
      [`__g();yield* me.${how}(args.thing)`, 'const yaw = me.yaw, t0 = w.t', 'yield* me.turnTo(me.ahead(-3))', 'args.thing.state.frames = Math.round((w.t - t0) / w.dt)', 'args.thing.state.turn = Math.cos(me.yaw - yaw)'].join('\n')
    expect(sim.library.addAction(actionEntry('ride-round', thing, `${turn('ride')}\nconst before = args.thing.yaw\nme.yaw += 1\nyield\nargs.thing.state.set = args.thing.yaw - before`))).toEqual({ ok: true })
    expect(sim.library.addAction(actionEntry('sit-round', thing, turn('sitOn')))).toEqual({ ok: true })
    const bike = itemOf(sim, 'bike')
    const bench = itemOf(sim, 'bench')
    sim.give('alice', [step('ride-round', { thing: bike.id })], true)
    sim.give('steve', [step('sit-round', { thing: bench.id })], true)
    const events = run(sim, 8)
    expect(events.filter((e) => e.type === 'done').map((e) => e.actor).sort()).toEqual(['alice', 'steve'])
    // Half a turn at 6 radians a second, the bike and its rider round together; then a yaw set turns the bike too.
    expect(bike.state.frames).toBeLessThan(40)
    expect(bike.state.turn).toBeLessThan(-0.99)
    expect(bike.state.set).toBeCloseTo(1, 6)
    expect(Math.cos(actor(sim, 'alice').yaw - bike.yaw)).toBeCloseTo(1, 6)
    // Sitting on the bench: no turn, and no two seconds lost.
    expect(bench.state.frames).toBe(1)
    expect(bench.state.turn).toBeCloseTo(1, 6)
  })

  it('keeps a thing where code put it when code also zeroes its speed, so it can be caught', () => {
    const sim = makeSim({ layouts: { playground: [{ kind: 'ball', x: -3, z: 3 }] } })
    const catcher = [
      '__g();const b = args.thing',
      'w.launch(b, 0, 4, 0)',
      'yield* w.wait(0.2)',
      'const h = me.handAt()',
      'b.x = h.x; b.y = h.y; b.z = h.z; b.vx = b.vy = b.vz = 0',
      "me.say('Got it!')",
      'yield* w.wait(0.3)',
      'b.state.drop = h.y - b.y',
      'b.state.flying = b.flying ? 1 : 0',
      'yield* me.pickUp(b)',
      'b.vx = 0; b.vy = 0; b.vz = 0',
      'yield',
      'b.state.held = b.holder === me ? 1 : 0',
    ].join('\n')
    expect(sim.library.addAction(actionEntry('catch', thing, catcher))).toEqual({ ok: true })
    const ball = itemOf(sim, 'ball')
    sim.give('alice', [step('catch', { thing: ball.id })], true)
    runUntil(sim, 'done', 'alice', 6)
    expect(ball.state).toMatchObject({ drop: 0, flying: 0, held: 1 })
    expect(ball.holder).toEqual({ actor: 'alice', hand: 'right' })
  })

  it('puffs at a thing but at the height given', () => {
    const sim = makeSim()
    expect(sim.library.addAction(actionEntry('tip', [], "__g();w.puff({ at: me, y: 3, kind: 'spark', count: 5, speed: 0, up: 0, gravity: 0 })\nyield"))).toEqual({ ok: true })
    sim.give('alice', [step('tip')], true)
    run(sim, 0.1)
    const sparks = sim.world.puffs.filter((p) => p.kind === 'spark')
    expect(sparks.length).toBe(5)
    for (const p of sparks) expect(p.y).toBe(3)
  })

  it('renames only with words or a number', () => {
    const sim = makeSim()
    expect(sim.library.addAction(actionEntry('names', [], '__g();me.name = args.to\nme.name = undefined\nme.name = null\nme.name = { x: 1 }\nme.name = () => (__g(), 1)\nme.name = true\nyield\nme.name = 7'))).toEqual({ ok: true })
    const alice = actor(sim, 'alice')
    sim.give('alice', [step('names')], true)
    sim.step()
    expect(alice.name).toBe('Alice')
    runUntil(sim, 'done', 'alice', 1)
    expect(alice.name).toBe('7')
    expect(alice.calls).toEqual(['alice', '7'])
  })

  it('runs the process of a worn thing, keeps the handle live, holds other things in the free hand, and takes the very thing off again', () => {
    const sim = makeSim({ layouts: { playground: [{ kind: 'ball', x: -3, z: 3 }] } })
    expect(sim.library.addItem(wand)).toEqual({ ok: true })
    const made = sim.makeItem('wand', { x: -2, z: 3 })
    const act = [
      "__g();const wand = w.find('wand')",
      'yield* me.pickUp(args.thing)',
      'me.wear(wand)',
      "wand.tint = 'pink'",
      'wand.state.mine = 1',
      'yield* me.pickUp(args.thing)',
      'yield* w.wait(1)',
      "const off = me.takeOff('hand')",
      'off.state.same = off === wand ? 1 : 0',
      'yield',
    ].join('\n')
    expect(sim.library.addAction(actionEntry('wand-play', thing, act))).toEqual({ ok: true })
    const alice = actor(sim, 'alice')
    const ball = itemOf(sim, 'ball')
    let worn = 0
    let sparks = 0
    let starTurn = 0
    sim.give('alice', [step('wand-play', { thing: ball.id })], true)
    runUntil(sim, 'done', 'alice', 10, () => {
      if (alice.look.worn.hand === undefined) return
      worn++
      // The wand fills the right hand: the ball was moved to the left, and stays there.
      expect(alice.hands).toEqual({ left: ball.id, right: null })
      expect(alice.look.worn.hand).toEqual({ kind: 'wand', tint: parseColor('pink') })
      starTurn = alice.wornParts?.hand?.star?.ry ?? 0
      // Sparks at the star, up by the hand.
      const hand = handFrame(alice, 'right').p
      sparks += sim.world.puffs.filter((p) => p.kind === 'spark' && p.born === sim.world.t && Math.hypot(p.x - hand[0], p.z - hand[2]) < 0.3 && p.y > hand[1]).length
    })
    expect(worn).toBeGreaterThan(55)
    expect(sparks).toBeGreaterThan(50)
    expect(starTurn).toBeGreaterThan(1.5)
    // Off again: the very wand, back in the room, its state kept, painted as it was worn.
    const back = itemOf(sim, 'wand')
    expect(back).toBe(made)
    expect(back.state).toMatchObject({ mine: 1, same: 1 })
    expect(back.state.n).toBeGreaterThan(60)
    expect(back.tint).toBe(parseColor('pink'))
    expect(alice.look.worn.hand).toBeUndefined()
    expect(alice.wornParts?.hand).toBeUndefined()
  })

  it('puts on a wand held in the left hand and moves what the right hand held into the left one', () => {
    const sim = makeSim({ layouts: { playground: [{ kind: 'ball', x: -3, z: 3 }] } })
    expect(sim.library.addItem(wand)).toEqual({ ok: true })
    sim.makeItem('wand', { x: -2, z: 3 })
    const act = [
      "__g();const wand = w.find('wand')",
      'yield* me.pickUp(args.thing)',
      'yield* me.pickUp(wand)',
      "args.thing.state.before = me.holding('right') === args.thing && me.holding('left') === wand ? 1 : 0",
      'me.wear(wand)',
      'yield',
    ].join('\n')
    expect(sim.library.addAction(actionEntry('wand-on', thing, act))).toEqual({ ok: true })
    const alice = actor(sim, 'alice')
    const ball = itemOf(sim, 'ball')
    sim.give('alice', [step('wand-on', { thing: ball.id })], true)
    runUntil(sim, 'done', 'alice', 10)
    expect(ball.state.before).toBe(1)
    expect(alice.look.worn.hand?.kind).toBe('wand')
    expect(alice.hands).toEqual({ left: ball.id, right: null })
    expect(ball.holder).toEqual({ actor: 'alice', hand: 'left' })
  })

  it('gives a look from the library its worn things’ processes too', () => {
    const sim = makeSim()
    expect(sim.library.addItem(wand)).toEqual({ ok: true })
    const alice = actor(sim, 'alice')
    alice.look.worn.hand = { kind: 'wand', tint: null }
    const before = sim.world.items.length
    run(sim, 0.5)
    expect(alice.wornParts?.hand?.star?.ry).toBeCloseTo(30 * STEP * 2, 3)
    expect(sim.world.items.length).toBe(before)
    expect(structuredClone(sim.world)).toEqual(sim.world)
    alice.look.worn = {}
    run(sim, 0.1)
    expect(alice.wornParts).toEqual({})
  })

  it('shows a reaction in the world while it plays', () => {
    const sim = makeSim()
    const alice = actor(sim, 'alice')
    sim.react('alice', 'hello')
    sim.step()
    expect(alice.reacting).toBe('hello')
    run(sim, 3)
    expect(alice.reacting).toBe(null)
    sim.react('alice', 'huh')
    sim.stop('alice')
    expect(alice.reacting).toBe(null)
  })

  it('lets a worn thing know who wears it; a worn thing has no holder', () => {
    const sim = makeSim()
    const tick = "function __tick(it, w, dt) {\n__g();it.state.worn = it.wearer === null ? 0 : it.wearer.id === 'alice' ? 1 : 2\nit.state.held = it.holder === null ? 0 : 1\n}"
    expect(sim.library.addItem({ ...itemEntry('wand', "__g();m.cylinder(0.02, 0.02, 0.4, { at: [0, 0.2, 0], color: 'brown' })\nreturn { carry: 'hand', wear: 'hand' }"), tick: '', tickGuarded: tick })).toEqual({ ok: true })
    const loose = sim.makeItem('wand', { x: 2, z: 0 })
    actor(sim, 'alice').look.worn.hand = { kind: 'wand', tint: null }
    sim.step()
    sim.step()
    expect([...sim.side.worn.values()].find((i) => i.kind === 'wand')!.state).toEqual({ worn: 1, held: 0 })
    expect(sim.world.items.find((i) => i.id === loose.id)!.state).toEqual({ worn: 0, held: 0 })
  })

  it('says aloud what it is told to speak, a line or two a frame from each actor at most', () => {
    const sim = makeSim()
    expect(sim.library.addAction(actionEntry('chatter', [], "__g();me.speak('hei kaikille')\nfor (let i = 0; i < 5; i++) {__g(); me.speak('moi') }\nme.say('just a bubble')\nyield"))).toEqual({ ok: true })
    sim.give('alice', [step('chatter')], true)
    sim.give('steve', [step('chatter')], true)
    sim.step()
    expect(sim.world.speech).toEqual([
      { actor: 'alice', text: 'hei kaikille' },
      { actor: 'alice', text: 'moi' },
      { actor: 'steve', text: 'hei kaikille' },
      { actor: 'steve', text: 'moi' },
    ])
    expect(actor(sim, 'alice').bubble?.text).toBe('just a bubble')
  })

  it('says a line aloud once while it lasts, though code says it every frame, all of it, and again for the next step', () => {
    const sim = makeSim()
    const words: Param[] = [{ name: 'words', kind: 'text', about: '', optional: false }]
    expect(sim.library.addAction(actionEntry('chant', words, '__g();yield* w.during(2, () => {__g(); me.speak(args.words, 5) })\nyield'))).toEqual({ ok: true })
    const long = 'minä olen maailman paras prinsessa ja minulla on kultainen kruunu'
    // The second step starts while the first one's line still lasts: a new step, so it is said again.
    sim.give('alice', [step('chant', { words: long }), step('chant', { words: long })], true)
    const said: { actor: string; text: string }[] = []
    let bubble = ''
    for (let i = Math.round(6 / STEP); i > 0; i--) {
      sim.step()
      said.push(...sim.world.speech)
      sim.world.speech.length = 0
      bubble = actor(sim, 'alice').bubble?.text ?? bubble
    }
    expect(said).toEqual([
      { actor: 'alice', text: long },
      { actor: 'alice', text: long },
    ])
    expect(bubble).toBe(long.slice(0, 48))
  })

  it('ends a made action that takes too long in real time and takes away a slow process; built-ins are not timed', () => {
    const sim = makeSim()
    expect(sim.library.addAction(actionEntry('slow', [], '__g();for (;;) {__g(); me.yaw += 0.01; yield }'))).toEqual({ ok: true })
    const lamp = { ...itemEntry('slow-lamp', "__g();m.box(0.3, 0.3, 0.3, { at: [0, 0.15, 0], color: 'red' })"), tick: '', tickGuarded: 'function __tick(it, w, dt) {\n__g();it.state.n = (it.state.n || 0) + 1\n}' }
    expect(sim.library.addItem(lamp)).toEqual({ ok: true })
    const it = sim.makeItem('slow-lamp', { x: 2, z: 0 })
    // Every look at the clock finds 20 ms gone: each call into made code seems to take at least that.
    let clock = 0
    const spy = vi.spyOn(performance, 'now').mockImplementation(() => (clock += 20))
    try {
      sim.give('alice', [step('slow')], true)
      sim.give('steve', [step('walk', { target: '3,-3' })], true)
      const events = run(sim, 3)
      const failed = events.find((e) => e.type === 'failed' && e.actor === 'alice')
      expect(failed).toMatchObject({ error: expect.stringContaining('too long') })
      expect(events.some((e) => e.type === 'failed' && e.actor === 'steve')).toBe(false)
      const n = it.state.n!
      expect(n).toBeGreaterThan(10)
      run(sim, 1)
      expect(it.state.n).toBe(n)
    } finally {
      spy.mockRestore()
    }
  })
})
