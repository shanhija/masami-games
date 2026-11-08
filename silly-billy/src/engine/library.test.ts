/**
 * The library: built-ins build, unknown kinds get a mystery box, a made item shows its draft
 * at once and its model when it comes, code that fails keeps the version before, and words a
 * child says find the things and verbs they mean.
 */
import { describe, expect, it } from 'vitest'

import type { ActionEntry, ItemEntry } from './protocol'
import { actionEntry, itemEntry, newLibrary } from './testing'

describe('library', () => {
  it('builds the built-ins and gives an unknown kind a mystery box', () => {
    const lib = newLibrary()
    const ball = lib.info('ball')
    expect(ball.rough).toBe(false)
    expect(ball.recipe.meta.bouncy).toBe(0.75)
    expect(ball.radius).toBeCloseTo(0.12)
    expect(ball.size[1]).toBeCloseTo(0.24)
    const box = lib.info('unicorn')
    expect(box.kind).toBe('unicorn')
    expect(box.recipe.shapes.length).toBeGreaterThan(10)
    expect(box.size.map((v) => Number(v.toFixed(2)))).toEqual([0.42, 0.4, 0.42])
    expect(lib.info('unicorn')).toBe(box)
  })

  it('shows the draft at once and the real model when it comes', () => {
    const lib = newLibrary()
    const v0 = lib.version
    expect(lib.addItem(itemEntry('tree', null, ['kuusi']))).toEqual({ ok: true })
    expect(lib.info('tree').rough).toBe(true)
    expect(lib.info('tree').recipe.meta.carry).toBe('hug')
    expect(lib.version).toBe(v0 + 1)
    expect(lib.addItem(itemEntry('tree', "__g();m.cone(1, 3, { at: [0, 1.5, 0], color: 'green' })\nreturn { solid: true, carry: 'no' }"))).toEqual({ ok: true })
    const tree = lib.info('tree')
    expect(tree.rough).toBe(false)
    expect(tree.size[1]).toBeCloseTo(3)
    expect(tree.recipe.meta.solid).toBe(true)
  })

  it('keeps the version before when new code fails, and says why', () => {
    const lib = newLibrary()
    lib.addItem(itemEntry('tree', "__g();m.cone(1, 3, { at: [0, 1.5, 0], color: 'green' })"))
    const before = lib.info('tree')
    const empty = lib.addItem(itemEntry('tree', '__g();return { carry: "no" }'))
    expect(empty).toEqual({ ok: false, error: 'Error: the model has no shapes' })
    const thrown = lib.addItem(itemEntry('tree', '__g();m.box(1, 1, 1)\nm.nothing()'))
    expect(thrown.ok).toBe(false)
    expect(!thrown.ok && thrown.error).toMatch(/TypeError: m.nothing is not a function \(line 2\)/)
    const looping = lib.addItem(itemEntry('tree', 'while (true) {__g(); }'))
    expect(!looping.ok && looping.error).toMatch(/^GuardError/)
    expect(lib.info('tree')).toBe(before)

    expect(lib.addAction(actionEntry('hop', [], '__g();yield'))).toEqual({ ok: true })
    const hop = lib.actions.get('hop')
    const broken = lib.addAction({ ...actionEntry('hop', [], ''), guarded: 'function* __action(me, args, w) {\nyield )(\n}' })
    expect(broken.ok).toBe(false)
    expect(lib.actions.get('hop')).toBe(hop)
  })

  it('finds kinds and actions by the words a child says', () => {
    const lib = newLibrary()
    expect(lib.itemKindFor('pallolle')).toBe('ball')
    expect(lib.itemKindFor('Pallo')).toBe('ball')
    expect(lib.itemKindFor('ball')).toBe('ball')
    expect(lib.itemKindFor('penkkiä')).toBe('bench')
    // A stem that changes is for the calls to list: 'penkki' does not give 'penkille'.
    expect(lib.itemKindFor('penkille')).toBe(null)
    expect(lib.itemKindFor('polkupyörällä')).toBe('bike')
    expect(lib.itemKindFor('pallp')).toBe('ball')
    // One letter off keeps the first letter: recognizers seldom miss the first sound.
    expect(lib.itemKindFor('mallo')).toBe(null)
    // And it is only a guess, which the parser can leave out.
    expect(lib.matchForm('items', 'pallp')).toEqual({ id: 'ball', form: 'near' })
    expect(lib.matchForm('items', 'pallolle')).toEqual({ id: 'ball', form: 'ending' })
    expect(lib.matchForm('items', 'Pallo')).toEqual({ id: 'ball', form: 'exact' })
    expect(lib.itemKindFor('pallp', { near: false })).toBe(null)
    expect(lib.itemKindFor('pallolle', { near: false })).toBe('ball')
    expect(lib.actionFor('kävelee', { near: false })).toBe(null)
    expect(lib.actionFor('heitä', { near: false })).toBe('throw')
    expect(lib.itemKindFor('pal')).toBe(null)
    expect(lib.itemKindFor('auto')).toBe(null)
    expect(lib.actionFor('heitä')).toBe('throw')
    expect(lib.actionFor('kävelee')).toBe('walk')
    expect(lib.actionFor('pick up')).toBe('pick-up')
    expect(lib.actionFor('pick-up')).toBe('pick-up')
    lib.addItem(itemEntry('christmas-tree', null, ['joulukuusi']))
    expect(lib.itemKindFor('joulukuusikin')).toBe('christmas-tree')
    expect(lib.itemKindFor('joulukuuseen')).toBe(null)
    expect(lib.itemKindFor('christmas tree')).toBe('christmas-tree')
  })

  it('names a made thing or action in Finnish by its own Finnish name, else its first call, else its name', () => {
    const lib = newLibrary()
    expect(lib.addItem({ ...itemEntry('kite', null, ['kite']), nameFi: 'leija' })).toEqual({ ok: true })
    expect([lib.items.get('kite')!.nameFi, lib.info('kite').nameFi]).toEqual(['leija', 'leija'])
    // Found by its Finnish name too, with an ending.
    expect(lib.itemKindFor('leijalla')).toBe('kite')
    // Saved before things had a Finnish name.
    const { nameFi: _item, ...old } = itemEntry('scooter', null, ['potkulauta', 'scooter'])
    expect(lib.addItem(old as ItemEntry)).toEqual({ ok: true })
    expect(lib.info('scooter').nameFi).toBe('potkulauta')
    expect(lib.addItem({ ...itemEntry('sled', null, []), nameFi: ' ' })).toEqual({ ok: true })
    expect(lib.info('sled').nameFi).toBe('sled')
    expect(lib.addAction({ ...actionEntry('cartwheel', [], '__g();yield'), nameFi: 'tee kärrynpyörä' })).toEqual({ ok: true })
    expect(lib.actions.get('cartwheel')!.nameFi).toBe('tee kärrynpyörä')
    const { nameFi: _action, ...oldAction } = { ...actionEntry('dance', [], '__g();yield'), calls: ['tanssi', 'dance'] }
    expect(lib.addAction(oldAction as ActionEntry)).toEqual({ ok: true })
    expect(lib.actions.get('dance')!.nameFi).toBe('tanssi')
    // A kind nobody made is called by its own word in both.
    expect(lib.info('unicorn').nameFi).toBe('unicorn')
  })

  it('forgets made things and keeps the built-ins', () => {
    const lib = newLibrary()
    const ball = lib.info('ball')
    lib.addItem(itemEntry('ball', "__g();m.sphere(0.5, { color: 'gold' })"))
    expect(lib.info('ball')).not.toBe(ball)
    lib.forget('item', 'ball')
    expect(lib.info('ball')).toBe(ball)
    lib.addAction(actionEntry('hop', [], '__g();yield'))
    lib.forget('action', 'hop')
    expect(lib.actions.has('hop')).toBe(false)
    expect(lib.actionFor('hop')).toBe(null)
  })
})
