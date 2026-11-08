/**
 * Finding a way round solid things (path.ts), one trap at a time, with the rooms' own numbers:
 * the slide's end where Noora stood inside Mirri on 2026-11-08 and walked on the spot, the
 * forest camp's pocket between the fire and its logs, a palm against the pool's edge, a goal
 * behind or inside a thing, a start inside one beside a corner, and a goal walled in.
 */
import { describe, expect, it } from 'vitest'

import { blocker, clearLine, fieldFor, findWay, nextStep, type Circle, type Point, type Way } from './path'
import { ROOM_HALF } from './types'

/** The radii walkTo uses: a kid, Noora, a grown-up, the cat. */
const KID = 0.24
const NOORA = 0.219
const GROWNUP = 0.33
const CAT = 0.28
const lim = (me: number) => ROOM_HALF - Math.min(me, 1)

/** The nearest the way's straight lines come to a circle's edge, less the walker's radius: below 0 means it cut into the thing. */
function clearance(from: Point, way: Way, circles: readonly Circle[], me: number): number {
  let least = Infinity
  let a = from
  for (const b of way.points) {
    for (const c of circles) {
      const abx = b.x - a.x
      const abz = b.z - a.z
      const L2 = abx * abx + abz * abz
      const t = L2 > 0 ? Math.max(0, Math.min(1, ((c.x - a.x) * abx + (c.z - a.z) * abz) / L2)) : 0
      least = Math.min(least, Math.hypot(a.x + abx * t - c.x, a.z + abz * t - c.z) - c.r - me)
    }
    a = b
  }
  return least
}

const last = (way: Way) => way.points[way.points.length - 1]!

describe('the way round things', () => {
  it('goes round a wide thing to a goal behind it, keeping clear of it', () => {
    // The playground's slide, 1.87 m round, between a kid and the spot behind it.
    const slide: Circle = { x: -6.5, z: -5.5, r: 1.87 }
    const from = { x: -6.5, z: -1 }
    const to = { x: -6.5, z: -7.655 }
    const way = findWay(fieldFor([slide]), { from, to, reach: 0.1, me: KID, skip: -1, lim: lim(KID) })!
    expect(way.reaches).toBe(true)
    expect(Math.hypot(last(way).x - to.x, last(way).z - to.z)).toBeLessThan(0.25)
    expect(clearance(from, way, [slide], KID)).toBeGreaterThan(0)
    // Round the near side of the circle: half its girth and the two ends, not a wander.
    expect(way.length).toBeLessThan(Math.PI * (slide.r + KID) + 2 * 2.5)
    // Pulled straight: a few corners, not a square per step.
    expect(way.points.length).toBeLessThan(12)
  })

  it('walks out of the camp past the fire and its logs, where steering alone stopped in the pocket', () => {
    // The forest camp: Mike pushed for 12 s at (-2.56, -4.39), between the fire and the logs.
    const camp: Circle[] = [
      { x: -2.2, z: -3.6, r: 0.57 },
      { x: -2.2, z: -5.6, r: 0.93 },
      { x: -4.4, z: -3.2, r: 0.93 },
      { x: -3, z: -1.6, r: 0.63 },
    ]
    const from = { x: -5.94, z: -4.39 }
    const to = { x: 7.64, z: -0.76 }
    const way = findWay(fieldFor(camp), { from, to, reach: 0.1, me: GROWNUP, skip: -1, lim: lim(GROWNUP) })!
    expect(way.reaches).toBe(true)
    expect(clearance(from, way, camp, GROWNUP)).toBeGreaterThan(0)
    // Round the camp, not through its pocket.
    expect(clearLine(camp, -1, GROWNUP, from, to)).toBe(false)
  })

  it('goes round the inside of a palm that touches the room edge, not along the edge into it', () => {
    // The pool's palm at the right edge: grown by the cat's size it reaches past where the cat may go.
    const palm: Circle = { x: 10.3, z: -6, r: 1.48 }
    expect(palm.x + palm.r + CAT).toBeGreaterThan(lim(CAT))
    const from = { x: 11.5, z: -1 }
    const to = { x: 11.5, z: -9 }
    const way = findWay(fieldFor([palm]), { from, to, reach: 0.1, me: CAT, skip: -1, lim: lim(CAT) })!
    expect(way.reaches).toBe(true)
    expect(clearance(from, way, [palm], CAT)).toBeGreaterThan(0)
    expect(Math.min(...way.points.map((p) => p.x))).toBeLessThan(palm.x - palm.r - CAT)
  })

  it('ends at the nearest spot it can reach when the goal is inside a thing', () => {
    const rock: Circle = { x: 0, z: 0, r: 1 }
    const way = findWay(fieldFor([rock]), { from: { x: 5, z: 0 }, to: { x: 0.3, z: 0 }, reach: 0.1, me: KID, skip: -1, lim: lim(KID) })!
    expect(way.reaches).toBe(false)
    // By the rock on the walker's side, at most half a metre short of its edge: the last stretch walks up to it.
    expect(last(way).x).toBeGreaterThan(rock.r + KID - 0.05)
    expect(last(way).x).toBeLessThan(rock.r + KID + 0.6)
    expect(Math.abs(last(way).z)).toBeLessThan(0.3)
  })

  it('walks right up to the thing it walks to: that one is left out', () => {
    const things: Circle[] = [{ x: 0, z: 0, r: 1 }, { x: 0, z: 4, r: 1 }]
    // To the first thing's middle, from behind the second: round the second, up to the first.
    const way = findWay(fieldFor(things), { from: { x: 0, z: 7 }, to: { x: 0, z: 0 }, reach: 1 + KID + 0.2, me: KID, skip: 0, lim: lim(KID) })!
    expect(way.reaches).toBe(true)
    expect(clearance({ x: 0, z: 7 }, way, [things[1]!], KID)).toBeGreaterThan(0)
    expect(Math.hypot(last(way).x, last(way).z)).toBeLessThan(1 + KID + 0.2 + 0.15)
  })

  it('starting inside a palm by a corner, gets out toward the goal, not into the corner behind it', () => {
    // A test put Steve at (10.67, -11.25), inside the corner palm; the corner beyond it is free but leads nowhere.
    const palm: Circle = { x: 10.3, z: -10.3, r: 1.48 }
    const from = { x: 10.67, z: -11.25 }
    const to = { x: -7.72, z: 4.28 }
    const way = findWay(fieldFor([palm]), { from, to, reach: 0.15, me: KID, skip: -1, lim: lim(KID) })!
    expect(way.reaches).toBe(true)
    expect(Math.hypot(last(way).x - to.x, last(way).z - to.z)).toBeLessThan(0.3)
  })

  it('goes as near as it can to a goal walled in by things, on its own side', () => {
    // A ring of rocks round the goal, overlapping. Every notch between two rocks is as near the
    // goal as the next; the one on the walker's side will do, not one round the back.
    const ring: Circle[] = Array.from({ length: 12 }, (_, k) => ({ x: 3 * Math.sin((k * Math.PI) / 6), z: 3 * Math.cos((k * Math.PI) / 6), r: 0.9 }))
    const from = { x: 0, z: 8 }
    const way = findWay(fieldFor(ring), { from, to: { x: 0, z: 0 }, reach: 0.1, me: KID, skip: -1, lim: lim(KID) })!
    expect(way.reaches).toBe(false)
    expect(clearance(from, way, ring, KID)).toBeGreaterThan(0)
    expect(last(way).z).toBeGreaterThan(2.5)
    expect(way.length).toBeLessThan(5)
  })

  it('keeps the field for the same things', () => {
    const things = [{ x: 1, z: 2, r: 0.5 }]
    expect(fieldFor(things)).toBe(fieldFor([{ x: 1, z: 2, r: 0.5 }]))
    expect(fieldFor(things)).not.toBe(fieldFor([{ x: 1, z: 2.5, r: 0.5 }]))
  })

  it('goes round actors standing in the way when asked to', () => {
    // Three in a row across the way.
    const row: Circle[] = [-0.5, 0, 0.5].map((x) => ({ x, z: 0, r: KID }))
    const from = { x: 0, z: 3 }
    const way = findWay(fieldFor([]), { from, to: { x: 0, z: -3 }, reach: 0.1, me: KID, skip: -1, lim: lim(KID), extra: row })!
    expect(way.reaches).toBe(true)
    expect(clearance(from, way, row, KID)).toBeGreaterThan(0)
  })
})

describe('one step at a time', () => {
  it('slides out of an actor it was left inside beside a thing, and never into the thing (the slide end, 2026-11-08)', () => {
    // Both did the made slide and ended on the same spot at its end: Noora inside Mirri, a hair
    // outside the slide's circle. Old steering slid round Mirri into the slide and was pushed back
    // by both for 12 s, twice, as Sami told her to swing.
    const slide: Circle = { x: -6.5, z: -5.5, r: 1.87 }
    const mirri: Circle = { x: -6.46, z: -3.3, r: CAT }
    let p = { x: -6.5, z: -3.35 }
    const swing = { x: 0, z: -7 }
    let side = 1
    for (let frame = 0; frame < 60; frame++) {
      const d = Math.hypot(swing.x - p.x, swing.z - p.z)
      const s = nextStep(p.x, p.z, (swing.x - p.x) / d, (swing.z - p.z) / d, 0.025, NOORA, [slide], -1, [mirri], lim(NOORA), side)
      expect(s).not.toBeNull()
      // Never into the slide.
      expect(Math.hypot(s!.x - slide.x, s!.z - slide.z)).toBeGreaterThanOrEqual(slide.r + NOORA - 1e-9)
      // Never deeper into Mirri.
      expect(Math.hypot(s!.x - mirri.x, s!.z - mirri.z)).toBeGreaterThanOrEqual(Math.min(Math.hypot(p.x - mirri.x, p.z - mirri.z), mirri.r + NOORA) - 1e-9)
      p = { x: s!.x, z: s!.z }
      side = s!.side
    }
    // A second later she is out of Mirri and well on her way.
    expect(Math.hypot(p.x - mirri.x, p.z - mirri.z)).toBeGreaterThan(mirri.r + NOORA)
    expect(Math.hypot(swing.x - p.x, swing.z - p.z)).toBeLessThan(Math.hypot(swing.x + 6.5, swing.z + 3.35) - 1)
  })

  it('walks out of a thing it is inside any way, and keeps out of the room edge', () => {
    const rock: Circle = { x: 0, z: 0, r: 1 }
    // Deeper in is allowed (it is inside already); out of the room is not.
    const deeper = nextStep(0.2, 0, -1, 0, 0.025, KID, [rock], -1, [], lim(KID), 1)!
    expect(deeper.x).toBeCloseTo(0.175, 9)
    expect(deeper.z).toBeCloseTo(0, 9)
    const atEdge = nextStep(lim(KID), 0, 1, 0, 0.025, KID, [], -1, [], lim(KID), 1)!
    expect(atEdge.x).toBeLessThanOrEqual(lim(KID))
  })

  it('says what stops a straight step: the edge, a thing, an actor, or nothing', () => {
    const rock: Circle = { x: 0, z: 2, r: 1 }
    const mike: Circle = { x: 2, z: 0, r: GROWNUP }
    expect(blocker(lim(KID), 0, 1, 0, 0.025, KID, [rock], -1, [mike], lim(KID))).toEqual({ kind: 'edge' })
    expect(blocker(0, 2 - 1 - KID - 0.01, 0, 1, 0.025, KID, [rock], -1, [mike], lim(KID))).toEqual({ kind: 'solid', index: 0 })
    expect(blocker(0, 2 - 1 - KID - 0.01, 0, 1, 0.025, KID, [rock], 0, [mike], lim(KID))).toBeNull()
    expect(blocker(2 - GROWNUP - KID - 0.01, 0, 1, 0, 0.025, KID, [rock], -1, [mike], lim(KID))).toEqual({ kind: 'actor', index: 0 })
    expect(blocker(-3, -3, 1, 0, 0.025, KID, [rock], -1, [mike], lim(KID))).toBeNull()
  })
})
