/**
 * Things put down nicely and things eaten ("almost no-one dropped the things after they were
 * done"): putting down in front, beside a thing and back where it was found; what a made action
 * picked up and still holds put down when it ends (unless kept, or the next step is about it);
 * eating bite by bite until it is gone, by what the thing is: yummy, yucky, poison, hot, not food;
 * eating from a bush; and food guessed from the names of things made before food was a thing.
 */
import { describe, expect, it } from 'vitest'

import { guessFood } from './kit'
import { actionEntry, itemEntry, makeSim, newLibrary, run, runUntil, step } from './testing'
import type { Item } from './types'

const thing = (id: string, code: string) => itemEntry(id, code)
const CAKE = thing('cake', "m.cylinder(0.25, 0.25, 0.2, { at: [0, 0.1, 0], color: 'pink' })\nreturn { carry: 'hand', solid: false }")
const SOCK = thing('sock', "m.box(0.1, 0.3, 0.1, { at: [0, 0.15, 0], color: 'white' })\nreturn { carry: 'hand', solid: false, food: 'yucky' }")
const BERRY = thing('toadberry', "m.sphere(0.1, { at: [0, 0.1, 0], color: 'purple' })\nreturn { carry: 'hand', solid: false, food: 'poison' }")
const SOUP = thing('soup', "m.cylinder(0.2, 0.15, 0.2, { at: [0, 0.1, 0], color: 'orange' })\nreturn { carry: 'hand', solid: false, food: 'yummy', temp: 'hot' }")
const BUSH = thing('berries', "m.sphere(0.5, { at: [0, 0.5, 0], color: 'green' })\nreturn { carry: 'no', solid: true, food: 'yummy' }")

const opt = (name: string, kind: 'item' | 'text') => ({ name, kind, about: name, optional: true })

function sim(actions: [string, string][] = [], layout: { kind: string; x: number; z: number }[] = []) {
  const library = newLibrary()
  for (const e of [CAKE, SOCK, BERRY, SOUP, BUSH]) expect(library.addItem(e)).toEqual({ ok: true })
  for (const [id, code] of actions) expect(library.addAction(actionEntry(id, [opt('thing', 'item')], code))).toEqual({ ok: true })
  return makeSim({ library, layouts: { playground: layout } })
}

const item = (s: ReturnType<typeof sim>, kind: string): Item | undefined => s.world.items.find((it) => it.kind === kind)

describe('putting things down', () => {
  it('puts what it holds down in front of it, standing on the ground, not dropped', () => {
    const s = sim([['carry', "yield* me.pickUp(args.thing)\nyield* me.walkTo(me.ahead(2))\nyield* me.putDown()"]], [{ kind: 'ball', x: 0, z: 1 }])
    const alice = s.world.actors[0]!
    s.give('alice', [step('carry', { thing: 'ball' })], true)
    runUntil(s, 'done', 'alice', 15)
    const ball = item(s, 'ball')!
    expect(ball.holder).toBe(null)
    expect(ball.loose).toBe(false)
    expect(ball.y).toBeCloseTo(0, 9)
    expect(Math.hypot(ball.x - alice.x, ball.z - alice.z)).toBeLessThan(0.7)
    run(s, 1)
    expect(ball.y).toBeCloseTo(0, 9)
  })

  it('puts a thing back exactly where it was picked up, and beside a thing', () => {
    const s = sim(
      [
        ['borrow', "yield* me.pickUp(args.thing)\nyield* me.walkTo({ x: -6, z: -6 })\nyield* me.putBack()"],
        ['by', "yield* me.pickUp(args.thing)\nconst r = w.find('rock')\nyield* me.putDown(args.thing, r)"],
      ],
      [
        { kind: 'ball', x: 3, z: -2 },
        { kind: 'rock', x: -5, z: 0 },
      ],
    )
    const ball = item(s, 'ball')!
    ball.yaw = 0.7
    s.give('alice', [step('borrow', { thing: 'ball' })], true)
    runUntil(s, 'done', 'alice', 30)
    expect(ball).toMatchObject({ x: 3, z: -2, yaw: 0.7, holder: null })
    s.give('alice', [step('by', { thing: 'ball' })], true)
    runUntil(s, 'done', 'alice', 30)
    const rock = item(s, 'rock')!
    const d = Math.hypot(ball.x - rock.x, ball.z - rock.z)
    expect(d).toBeGreaterThan(s.library.info('rock').radius)
    expect(d).toBeLessThan(s.library.info('rock').radius + 0.5)
  })

  it('puts down what a made action picked up and still holds when it ends; a kept thing and a picked-up one by the basic verb stay', () => {
    const s = sim(
      [
        ['play', "yield* me.pickUp(args.thing)\nyield* me.jump(0.3)"],
        ['hold', "yield* me.pickUp(args.thing)\nme.keep(args.thing)\nyield"],
      ],
      [
        { kind: 'ball', x: 0, z: 1 },
        { kind: 'box', x: -3, z: 3 },
        { kind: 'hat', x: 3, z: 3 },
      ],
    )
    const alice = s.world.actors[0]!
    s.give('alice', [step('play', { thing: 'ball' })], true)
    runUntil(s, 'done', 'alice', 15)
    expect(item(s, 'ball')!.holder?.actor).toBe('alice')
    run(s, 2)
    expect(item(s, 'ball')!.holder).toBe(null)
    expect(item(s, 'ball')!.loose).toBe(false)
    expect(alice.hands).toEqual({ left: null, right: null })
    s.give('alice', [step('hold', { thing: 'hat' })], true)
    runUntil(s, 'done', 'alice', 15)
    run(s, 2)
    expect(item(s, 'hat')!.holder?.actor).toBe('alice')
    s.give('steve', [step('pick-up', { thing: 'box' })], true)
    runUntil(s, 'done', 'steve', 15)
    run(s, 2)
    expect(item(s, 'box')!.holder?.actor).toBe('steve')
  })

  it('does not put down what the next step is about: a new command for the same thing keeps it in hand', () => {
    const s = sim([['play', "yield* me.pickUp(args.thing)\nyield* w.wait(5)"]], [{ kind: 'ball', x: 0, z: 1 }])
    s.give('alice', [step('play', { thing: 'ball' })], true)
    run(s, 4.5)
    expect(item(s, 'ball')!.holder?.actor).toBe('alice')
    // Told to throw it while still playing: the throw is about the ball, which stays in hand for it.
    s.give('alice', [step('throw', { thing: 'ball', target: 'steve' })], true)
    run(s, 0.3)
    expect(item(s, 'ball')!.holder?.actor).toBe('alice')
    const events = run(s, 6)
    expect(events.some((e) => e.type === 'done' && e.step.action === 'throw')).toBe(true)
    const steve = s.world.actors[1]!
    expect(Math.hypot(item(s, 'ball')!.x - steve.x, item(s, 'ball')!.z - steve.z)).toBeLessThan(2)
  })
})

describe('eating', () => {
  it('eats a yummy thing bite by bite until it is gone, happily', () => {
    const s = sim([['eat', 'yield* me.eat(args.thing)']], [{ kind: 'cake', x: 0, z: 1 }])
    const alice = s.world.actors[0]!
    const sizes: number[] = []
    const lines: string[] = []
    s.give('alice', [step('eat', { thing: 'cake' })], true)
    runUntil(s, 'done', 'alice', 15, () => {
      const cake = item(s, 'cake')
      if (cake !== undefined && cake.holder !== null) sizes.push(cake.scale)
      if (alice.bubble !== null) lines.push(alice.bubble.text)
    })
    expect(item(s, 'cake')).toBeUndefined()
    expect(new Set(sizes).size).toBeGreaterThanOrEqual(4)
    expect(sizes.every((v, i) => i === 0 || v <= sizes[i - 1]!)).toBe(true)
    expect(lines.some((l) => ['Yum!', 'Yummy!', 'So good!'].includes(l))).toBe(true)
    expect(alice.hands).toEqual({ left: null, right: null })
  })

  it('says yuck to yucky food, gets sick from poison and better again, gets hot from hot soup', () => {
    const s = sim([['eat', 'yield* me.eat(args.thing)']], [
      { kind: 'sock', x: 0, z: 1 },
      { kind: 'toadberry', x: 3, z: 3 },
      { kind: 'soup', x: -3, z: 3 },
    ])
    const [alice, steve] = s.world.actors
    const lines: string[] = []
    s.give('alice', [step('eat', { thing: 'sock' })], true)
    runUntil(s, 'done', 'alice', 15, () => void (alice!.bubble && lines.push(alice!.bubble.text)))
    expect(lines).toContain('Yuck!')
    s.give('steve', [step('eat', { thing: 'toadberry' })], true)
    runUntil(s, 'done', 'steve', 15)
    expect(steve!.effects?.sick).toBeGreaterThan(s.world.t)
    s.give('alice', [step('eat', { thing: 'soup' })], true)
    runUntil(s, 'done', 'alice', 15)
    expect(alice!.effects?.hot).toBeGreaterThan(s.world.t)
    run(s, 16)
    expect(steve!.effects).toBeUndefined()
    expect(steve!.pitch).toBeCloseTo(0, 6)
  })

  it('licks what is not food and says so, and eats from a bush that stays', () => {
    const s = sim([['eat', 'yield* me.eat(args.thing)']], [
      { kind: 'ball', x: 0, z: 1 },
      { kind: 'berries', x: 3, z: 0 },
    ])
    const alice = s.world.actors[0]!
    const lines: string[] = []
    s.give('alice', [step('eat', { thing: 'ball' })], true)
    runUntil(s, 'done', 'alice', 15, () => void (alice.bubble && lines.push(alice.bubble.text)))
    expect(lines).toContain('Not food!')
    expect(item(s, 'ball')).toBeDefined()
    s.give('steve', [step('eat', { thing: 'berries' })], true)
    runUntil(s, 'done', 'steve', 15)
    expect(item(s, 'berries')!.scale).toBe(1)
  })

  it('takes food from the names of things made before food was said, and poison first', () => {
    expect(guessFood(['cake'])).toBe('yummy')
    expect(guessFood(['sausage', 'makkara', 'makkaran'])).toBe('yummy')
    expect(guessFood(['ice-cream'])).toBe('yummy')
    expect(guessFood(['poison-apple', 'myrkkyomena'])).toBe('poison')
    expect(guessFood(['treehouse', 'puumaja'])).toBe(null)
    expect(guessFood(['pearl', 'helmi'])).toBe(null)
    const library = newLibrary()
    library.addItem(thing('sausage', "m.capsule(0.05, 0.3, { color: 'brown' })\nreturn { carry: 'hand' }"))
    expect(library.info('sausage').recipe.traits.food).toBe('yummy')
  })
})
