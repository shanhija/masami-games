/**
 * What crosses a building's edge: what each kind takes through a mouth and how much it holds,
 * the rocket's parts as the cards open them and as they fill, a napping muncher stopping a
 * machine, towers and bowls taking from the belt under them, and the stack's head going out.
 */
import { describe, expect, it } from 'vitest'

import { add, emptyBoard } from './beltKit'
import { BOWL_HOLD, HOLD, PART_INFO, TOWER_AMMO } from './catalog'
import { THINGS, thingIndex, type Kind, type Thing } from './model'
import { building, everWants, give, gives, openPart, pushHead, take, takeUnder, wants, wantsUnder } from './trade'

describe('a mouth', () => {
  it('feeds each machine what its recipe takes, up to HOLD of each', () => {
    const s = emptyBoard()
    const shop = add(s, 'workshop', 4, 4)
    const green = add(s, 'greenMaker', 8, 4)
    const orange = add(s, 'orangeMaker', 4, 7)
    expect(THINGS.filter((t) => wants(s, shop, t))).toEqual(['blueBar'])
    expect(THINGS.filter((t) => wants(s, green, t))).toEqual(['blueBar', 'goldBar'])
    expect(THINGS.filter((t) => wants(s, orange, t))).toEqual(['bubble', 'gear'])
    for (let i = 0; i < HOLD; i++) take(s, green, 'goldBar')
    expect(wants(s, green, 'goldBar')).toBe(false)
    expect(wants(s, green, 'blueBar')).toBe(true)
    expect(green.held[thingIndex('goldBar')]).toBe(HOLD)
    expect(() => take(s, green, 'goldBar')).toThrow()
    expect(s.events.filter((e) => e.kind === 'gulp').length).toBe(HOLD)
    expect(green.gulpAt).toBe(s.tick)
  })

  it('lines rocks up in an oven, HOLD at most, and pours every bottle into the lab', () => {
    const s = emptyBoard()
    const oven = add(s, 'oven', 4, 4)
    const lab = add(s, 'lab', 8, 4)
    const rocks: Thing[] = ['goldRock', 'blueRock', 'goldRock', 'blueRock']
    for (const r of rocks) take(s, oven, r)
    expect(oven.queue).toEqual(rocks)
    expect(wants(s, oven, 'blueRock')).toBe(false)
    expect(wants(s, oven, 'blueBar')).toBe(false)
    for (let i = 0; i < 50; i++) take(s, lab, i % 2 === 0 ? 'greenBottle' : 'orangeBottle')
    expect(wants(s, lab, 'greenBottle')).toBe(true)
    expect(wants(s, lab, 'gear')).toBe(false)
    expect(lab.held[thingIndex('greenBottle')]).toBe(25)
  })

  it('fills the rocket part that is open and not yet full', () => {
    const s = emptyBoard()
    const pad = add(s, 'pad', 1, 4)
    expect(THINGS.filter((t) => wants(s, pad, t))).toEqual(['blueBar'])
    s.found = ['digger', 'gold', 'science', 'gears']
    expect(THINGS.filter((t) => wants(s, pad, t))).toEqual(['blueBar', 'gear'])
    for (let i = 0; i < PART_INFO.legs.n; i++) take(s, pad, 'blueBar')
    expect(s.rocket.got[0]).toBe(PART_INFO.legs.n)
    expect(s.rocket.fullAt[0]).toBe(s.tick)
    expect(s.events.filter((e) => e.kind === 'fill').length).toBe(PART_INFO.legs.n)
    expect(s.events.filter((e) => e.kind === 'partFull')).toEqual([{ kind: 'partFull', part: 'legs' }])
    expect(wants(s, pad, 'blueBar')).toBe(false)
    expect(openPart(s, 'gear')).toBe(1)
    s.found.push('bubbles', 'hedges', 'nose', 'stars', 'snacks', 'more', 'rocket')
    // The nose takes gears as the body does (catalog.ts PART_INFO).
    expect(THINGS.filter((t) => wants(s, pad, t))).toEqual(['gear', 'orangeBottle'])
  })

  it('fills the new rocket on the pad after a landing, every part open again with its own thing', () => {
    const s = emptyBoard()
    const pad = add(s, 'pad', 1, 4)
    s.found = ['digger', 'gold', 'science', 'gears', 'bubbles', 'hedges', 'nose', 'stars', 'snacks', 'more', 'rocket', 'fuel']
    s.launches = 1
    expect(THINGS.filter((t) => wants(s, pad, t))).toEqual(['blueBar', 'gear', 'orangeBottle'])
    take(s, pad, 'gear')
    expect(s.rocket.got).toEqual([0, 1, 0, 0])
  })

  it('takes nothing into a digger or the pump, nor into a machine a muncher naps on', () => {
    const s = emptyBoard()
    for (const kind of ['digger', 'pump'] as Kind[]) expect(THINGS.some((t) => wants(s, add(s, kind, 4, 4), t))).toBe(false)
    const shop = add(s, 'workshop', 8, 4)
    shop.napper = 3
    expect(wants(s, shop, 'blueBar')).toBe(false)
    shop.stack = ['gear']
    expect(pushHead(shop)).toBeNull()
    shop.napper = -1
    expect(pushHead(shop)).toBe('gear')
  })
})

describe('a tower and a bowl', () => {
  it('take from the belt under them: a tower a bubble while it has room for its two shots, a bowl gold bars below BOWL_HOLD', () => {
    const s = emptyBoard()
    const tower = add(s, 'tower', 4, 4)
    const bowl = add(s, 'bowl', 6, 4)
    expect(wantsUnder(tower, 'goldBar')).toBe(false)
    takeUnder(s, tower, 'bubble')
    takeUnder(s, tower, 'bubble')
    expect([tower.ammo, tower.held[thingIndex('bubble')]]).toEqual([TOWER_AMMO, 2])
    expect(wantsUnder(tower, 'bubble')).toBe(false)
    tower.ammo = TOWER_AMMO - 1
    expect(wantsUnder(tower, 'bubble')).toBe(false)
    tower.ammo = TOWER_AMMO - 2
    expect(wantsUnder(tower, 'bubble')).toBe(true)
    for (let i = 0; i < BOWL_HOLD; i++) takeUnder(s, bowl, 'goldBar')
    expect(wantsUnder(bowl, 'goldBar')).toBe(false)
    expect(() => takeUnder(s, bowl, 'goldBar')).toThrow()
    expect(wants(s, tower, 'bubble')).toBe(false)
    expect(() => wantsUnder(building(s, add(s, 'oven', 8, 4).id), 'bubble')).toThrow()
  })
})

describe('a spout', () => {
  it('gives the oldest made thing on the roof, stamping the push', () => {
    const s = emptyBoard()
    const oven = add(s, 'oven', 4, 4)
    oven.stack = ['goldBar', 'blueBar']
    s.tick = 40
    expect(give(s, oven)).toBe('goldBar')
    expect(oven.stack).toEqual(['blueBar'])
    expect(oven.pushAt).toBe(40)
    expect(s.events).toEqual([{ kind: 'push', id: oven.id, thing: 'goldBar' }])
    give(s, oven)
    expect(() => give(s, oven)).toThrow()
  })

  it('tells what each kind gives and would ever take', () => {
    const s = emptyBoard()
    expect(gives(add(s, 'digger', 7, 2))).toEqual(['blueRock'])
    expect(gives(add(s, 'pump', 0, 8))).toEqual(['bubble'])
    expect(gives(add(s, 'orangeMaker', 4, 4))).toEqual(['orangeBottle'])
    expect(gives(add(s, 'lab', 8, 4))).toEqual([])
    expect(everWants('pad', 'orangeBottle')).toBe(true)
    expect(everWants('pad', 'greenBottle')).toBe(false)
    expect(everWants('oven', 'goldRock')).toBe(true)
    expect(everWants('lab', 'greenBottle')).toBe(true)
    expect(everWants('digger', 'blueRock')).toBe(false)
  })
})
