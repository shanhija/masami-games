import { describe, expect, it } from 'vitest'
import type { Words } from '../../../profiles/src/lang'
import type { Slot } from '../../../silly-billy/src/engine/types'
import { MISTAKES } from '../engine/api'
import { GIFT_SHAPES, SLOT_REF } from '../engine/gift'
import { PIECE_NAMES, PIECES } from '../own/wardrobe/pieces'
import type { GiftTry } from '../protocol'
import { guardCode } from '../server/codeKinds'
import { GIFT_LONG } from './compile'
import { checkGift, checkGifts, GIFT_MISTAKES, measureGift, nearMarker } from './giftCheck'

const NAME: Words = { en: 'top hat', fi: 'silinteri' }

/** A present as the server hands it to the page: its body guarded. A test fails on a guard error. */
function gift(slot: Slot, body: string, name: Words = NAME): GiftTry {
  const g = guardCode('gift', body)
  if (!g.ok) throw new Error(g.error)
  return { slot, name, form: 'a present', code: g.guarded }
}
const sentences = (g: GiftTry) => checkGift(g).sentences

const HAT = `m.cylinder(0.26, 0.28, 0.06, { at: [0, 0.2, 0], color: c.second })
m.cylinder(0.2, 0.22, 0.3, { at: [0, 0.38, 0], color: c.main })
m.sphere(0.05, { at: [0, 0.56, 0], color: '#ffd23f' })`

const CAPE = `m.extrude([[-0.2, 0.05], [0.2, 0.05], [0.32, -0.55], [-0.32, -0.55]], 0.03, { at: [0, 0, -0.04], color: c.main })
m.torus(0.12, 0.03, { at: [0, 0.06, 0.05], rot: [Math.PI / 2, 0, 0], color: c.second })`

const WAND = `m.cylinder(0.025, 0.025, 0.5, { at: [0, 0.25, 0], color: c.second })
const star = []
for (let i = 0; i < 10; i++) {
  const r = i % 2 === 0 ? 0.14 : 0.06
  const a = Math.PI / 2 + i * Math.PI / 5
  star.push([Math.cos(a) * r, 0.6 + Math.sin(a) * r])
}
m.extrude(star, 0.04, { color: c.main, glow: true })
m.anchor('hand', [0, 0.08, 0])`

const SKIRT = `m.lathe([[0.17, 0.42], [0.2, 0.38], [0.3, 0.24]], { color: c.main })
m.torus(0.17, 0.02, { at: [0, 0.42, 0], rot: [Math.PI / 2, 0, 0], color: c.second })`

describe('good presents, written as text, pass', () => {
  it.each([
    ['a hat', gift('head', HAT)],
    ['a cape', gift('back', CAPE)],
    ['a wand held in the hand', gift('hand', WAND, { en: 'star wand', fi: 'tähtisauva' })],
    ['a skirt', gift('body', SKIRT, { en: 'skirt', fi: 'hame' })],
  ])('%s', (_what, g) => {
    expect(checkGift(g)).toEqual({ passed: true, sentences: [] })
  })

  it('every piece of the starting wardrobe fits its own slot, in the markers unmixed', () => {
    for (const name of PIECE_NAMES) expect([name, measureGift(PIECES[name].make().recipe, PIECES[name].slot)]).toEqual([name, []])
  })
})

describe('broken presents fail, each with its sentence', () => {
  it('too many shapes', () => {
    expect(sentences(gift('head', 'for (let i = 0; i < 130; i++) m.sphere(0.02, { at: [0, 0.3, 0], color: c.main })'))).toEqual([GIFT_MISTAKES.tooManyShapes('130')])
    expect(GIFT_SHAPES).toBeLessThan(130)
  })

  it('outside its slot', () => {
    expect(sentences(gift('head', 'm.box(0.2, 0.2, 0.2, { at: [0, 2, 0], color: c.main })'))).toEqual([GIFT_MISTAKES.outside('head', 'y 2.1')])
    // Hair must leave the face free: out of its frame, and over the face.
    expect(sentences(gift('hair', 'm.sphere(0.3, { at: [0, 0, 0.2], color: c.main })'))).toEqual([GIFT_MISTAKES.outside('hair', 'z 0.5'), GIFT_MISTAKES.faceCovered('hair')])
    expect(GIFT_MISTAKES.outside('head', 'y 2.1')).toBe('worn as head, the present reaches y 2.1 from the middle of the head: it must stay within x -0.6 to 0.6, y -0.3 to 0.9, z -0.6 to 0.6 of it')
  })

  it('the face, as each slot leaves it free, seen from the front', () => {
    // Hair over the face, and a hat's band over the eyes: each inside its frame, and each in front of the face.
    expect(sentences(gift('hair', "m.sphere(0.25, { at: [0, 0.05, -0.02], color: c.main })\nm.box(0.2, 0.2, 0.04, { at: [0, 0.05, 0.3], color: c.main })"))).toEqual([GIFT_MISTAKES.faceCovered('hair')])
    expect(sentences(gift('head', `${HAT}\nm.box(0.3, 0.16, 0.03, { at: [0, 0.05, 0.3], color: c.second })`))).toEqual([GIFT_MISTAKES.faceCovered('head')])
    // A mask over the eyes, and glasses that leave them seen.
    expect(sentences(gift('face', 'm.box(0.3, 0.08, 0.02, { at: [0, 0.05, 0.25], color: c.main })'))).toEqual([GIFT_MISTAKES.eyesHidden()])
    expect(sentences(gift('face', 'for (const s of [-1, 1]) m.torus(0.06, 0.012, { at: [s * 0.075, 0.047, 0.25], color: c.main })'))).toEqual([])
    // The numbers are the line's own.
    expect(GIFT_MISTAKES.faceCovered('hair')).toBe('worn as hair, the present covers the face: nothing may be in front of the face between x -0.14 and 0.14 and y -0.15 and 0.08 from the middle of the head')
    expect(SLOT_REF.hair).toContain('nothing in front of the face between x -0.14 and 0.14 and y -0.15 and 0.08')
    expect(SLOT_REF.head).toContain('nothing in front of the face between x -0.14 and 0.14 and y 0 and 0.08')
    expect(SLOT_REF.face).toContain('nothing in front of the middle of each eye (x -0.07 and 0.07, y 0.05)')
  })

  it("a thrown error, with the designer's line", () => {
    expect(sentences(gift('head', `${HAT}\nthrow new Error('no')`))).toEqual([GIFT_MISTAKES.thrown('Error: no (line 4)')])
    // c is frozen.
    expect(sentences(gift('head', `${HAT}\nc.main = 'red'`))).toEqual([expect.stringMatching(/^the present's code threw: TypeError: .*main.* \(line 4\)$/)])
    // A misread kit says so, as the room's do.
    expect(sentences(gift('head', `${HAT}\nm.cube(1)`))).toEqual([expect.stringMatching(/^a kit has no cube: .* \(line 4\)$/)])
    expect(sentences(gift('head', 'const a = 1'))).toEqual([MISTAKES.noShapes('the present')])
  })

  it('an endless loop', () => {
    expect(sentences(gift('head', `${HAT}\nwhile (true) {}`))).toEqual([`${GIFT_LONG} (line 4)`])
  })

  it('a mixed marker colour, and no c.main at all', () => {
    expect(sentences(gift('head', `${HAT}\nm.box(0.1, 0.1, 0.1, { at: [0, 0.5, 0], color: '#fe4dfd' })`))).toEqual([GIFT_MISTAKES.mixed('#fe4dfd', 'main')])
    expect(sentences(gift('head', "m.sphere(0.25, { at: [0, 0.3, 0], color: 'gold' })"))).toEqual([GIFT_MISTAKES.noMain()])
    // Darker and lighter keep a marker's hue; other strong colours, hot pink and sky blue among them, are far enough.
    expect(['#ff00ff', '#b201b1', '#fe4dfd', '#00ffff', '#01a0a0'].map(nearMarker)).toEqual(['main', 'main', 'main', 'second', 'second'])
    expect(['#fe01fd', '#01fdfe', '#ff69b4', '#4cc9e0', '#d8a0d8', '#808080'].map(nearMarker)).toEqual([null, null, null, null, null, null])
  })

  it('a name too long, in either language', () => {
    expect(sentences(gift('head', HAT, { en: 'a very big shiny hat', fi: 'hattu' }))).toEqual([MISTAKES.tooManyWords("the present's name", 'English', 5, 3)])
    expect(sentences(gift('head', HAT, { en: 'hat', fi: '' }))).toEqual([MISTAKES.notWords("the present's name")])
  })

  it('too small for the hand, and a slot that is none', () => {
    expect(sentences(gift('hand', 'm.sphere(0.1, { color: c.main })'))).toEqual([GIFT_MISTAKES.handSmall(0.2)])
    expect(sentences({ ...gift('head', HAT), slot: 'tail' as Slot })).toEqual([GIFT_MISTAKES.notSlot('"tail"')])
  })
})

describe("a room's presents", () => {
  it('are checked in the order of the job', () => {
    const report = checkGifts({ room: 'room-1', gifts: [gift('head', HAT), gift('head', 'm.box(0.2, 0.2, 0.2, { at: [0, 2, 0], color: c.main })')] })
    expect(report.room).toBe('room-1')
    expect(report.checks.map((c) => c.passed)).toEqual([true, false])
  })
})
