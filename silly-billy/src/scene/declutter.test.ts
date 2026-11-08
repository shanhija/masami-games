import { describe, expect, it } from 'vitest'

import { mulberry32 } from '../../../castle-builder/src/game/random'
import { declutter, type TagBox } from './declutter'

const rect = (b: TagBox, [dx, dy]: readonly [number, number]) => ({ l: b.x - b.w / 2 + dx, r: b.x + b.w / 2 + dx, t: b.y - b.h + dy, b: b.y + dy })
const overlap = (a: ReturnType<typeof rect>, b: ReturnType<typeof rect>) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t

describe('the name tags', () => {
  it('leave a tag that covers nothing where it is', () => {
    expect(
      declutter([
        { x: 100, y: 100, w: 60, h: 20 },
        { x: 300, y: 100, w: 60, h: 20 },
      ]),
    ).toEqual([
      [0, 0],
      [0, 0],
    ])
  })

  it('move the farther of two tags over each other up, out from under the nearer one and its bubble', () => {
    // The pond: Mirri (near) with "Nice!" over her tag, Alice's tag behind it.
    const mirri = { x: 400, y: 265, w: 90, h: 46 }
    const alice = { x: 411, y: 283, w: 50, h: 21 }
    const [keep, moved] = declutter([mirri, alice])
    expect(keep).toEqual([0, 0])
    expect(overlap(rect(mirri, keep!), rect(alice, moved!))).toBe(false)
    expect(Math.abs(moved![0]) + Math.abs(moved![1])).toBeLessThan(80)
  })

  it('spread a crowded row out with no two covering each other, each near its owner', () => {
    // The cast in a row at the whole room on a phone: tags far wider than the gaps between them.
    const row = [0, 1, 2, 3, 4, 5].map((i) => ({ x: 219 - i * 22, y: 475 - i * 11, w: 46, h: 18 }))
    const at = declutter(row)
    for (let i = 0; i < row.length; i++) for (let j = 0; j < i; j++) expect(overlap(rect(row[i]!, at[i]!), rect(row[j]!, at[j]!))).toBe(false)
    for (const [dx, dy] of at) {
      expect(dy).toBeLessThanOrEqual(0)
      expect(Math.hypot(dx, dy)).toBeLessThan(120)
    }
  })

  it('never lets two of ten random name tags cover each other where there is room near them', () => {
    const rand = mulberry32(4)
    for (let n = 0; n < 50; n++) {
      // Ten names over the grass of a phone's screen.
      const boxes = Array.from({ length: 10 }, () => ({ x: 60 + rand() * 270, y: 300 + rand() * 300, w: 40 + rand() * 60, h: 21 }))
      const at = declutter(boxes, 390)
      for (let i = 0; i < boxes.length; i++) for (let j = 0; j < i; j++) expect(overlap(rect(boxes[i]!, at[i]!), rect(boxes[j]!, at[j]!))).toBe(false)
    }
  })

  it('keeps every block of a thick crowd near its owner and on the screen: past that the nearer one covers it', () => {
    const rand = mulberry32(7)
    for (let n = 0; n < 50; n++) {
      // A crowd saying things at the edge of a phone's screen, far more than fits.
      const boxes = Array.from({ length: 10 }, () => ({ x: rand() * 390, y: 300 + rand() * 80, w: 40 + rand() * 160, h: rand() < 0.4 ? 63 : 21 }))
      const at = declutter(boxes, 390)
      boxes.forEach((b, i) => {
        const [dx, dy] = at[i]!
        // Pushed in from an edge it would cross, and moved from there.
        const edge = Math.min(390 - b.w / 2 - b.x, Math.max(b.w / 2 - b.x, 0))
        if (i === 0) expect([dx, dy]).toEqual([edge, 0])
        expect(dy).toBeLessThanOrEqual(0)
        expect(Math.hypot(dx - edge, dy)).toBeLessThanOrEqual(Math.max(100, 2 * b.h) + 1e-9)
        expect(b.x + dx - b.w / 2).toBeGreaterThanOrEqual(-1e-9)
        expect(b.x + dx + b.w / 2).toBeLessThanOrEqual(390 + 1e-9)
      })
    }
  })

  it('keeps a block on the side it went to while the one in its way slides past, instead of hopping across', () => {
    // A column of three tags, and a fourth right behind the bottom one: beside it is nearer than over all three.
    const column = [100, 78, 56].map((y) => ({ x: 200, y, w: 40, h: 20 }))
    const behind = (x: number) => ({ x, y: 100, w: 40, h: 20 })
    const right = declutter([...column, behind(201)]).at(-1)!
    expect(right[0]).toBeGreaterThan(30)
    // A pixel or two to the left of the column's middle, the left side is nearer now: alone it goes there.
    expect(declutter([...column, behind(199)]).at(-1)![0]).toBeLessThan(-30)
    // But it remembers it was on the right, and slides a little instead.
    const kept = declutter([...column, { ...behind(199), was: right }]).at(-1)!
    expect(kept[0]).toBeGreaterThan(30)
    expect(Math.abs(kept[0] - right[0])).toBeLessThan(5)
    // Once its way is clear it goes home.
    expect(declutter([behind(199)].map((b) => ({ ...b, was: kept })))).toEqual([[0, 0]])
  })

  it('keeps a block on the screen when its owner stands at the edge, and lets an owner off the screen take its block with it', () => {
    const at = declutter(
      [
        { x: 10, y: 300, w: 100, h: 20 },
        { x: 385, y: 300, w: 60, h: 20 },
        { x: -30, y: 200, w: 60, h: 20 },
      ],
      390,
    )
    expect(at).toEqual([
      [40, 0],
      [-25, 0],
      [0, 0],
    ])
  })
})
