/**
 * The bots from high up (step 6): goTo over a floor on small rooms built with the builder, from
 * high up, on the house's floor (step 7a). The search (trial/highSearch.ts) walks across the floor
 * any way, round a wall, up a ramp, jumps a gap between ledges a running jump clears under the room's
 * top (corner to corner too) and up a top a jump reaches, refuses wider and higher ones with the
 * sentence from the floor graph (trial/highGraph.ts) in metres on the floor, rides a mover,
 * carries and pushes along the floor. Flower Bridge, the own room from high up, passes the whole
 * trial with the other own rooms (own/rooms/rooms.test.ts).
 *
 * The house's floor is under the whole room, so there is no pit: a gap is between ledges higher
 * than a jump lifts the feet from the floor (LEDGE), and from them the room's top, 3 m up, stops a
 * jump's rise after 0.15 m, so a running jump carries the feet less than a metre across. A corner
 * jump that a bot could not land for want of a run up needed a gap near 3 m, which no ledge under
 * the top allows, so that case is no longer tried here.
 */

import { describe, expect, it } from 'vitest'
import { FEEL, type Builder, type Point, type RoomCode, type ThingView, type World } from '../engine/api'
import { cos } from '../engine/math'
import { cube } from '../engine/testing'
import { BOT_REF, WALK_MISTAKES, WALK_PREAMBLE, type WalkCode } from './api'
import { walkInView } from './testing'

/** A room from high up, the house's floor 14 by 8 m under a 3 m top: the players at their starts, the way out in the back wall, one step never done. */
function room(starts: readonly Point[], build: (r: Builder, w: World) => void): RoomCode {
  return (r, w) => {
    build(r, w)
    w.players().forEach((p, i) => p.putAt(starts[i]))
    r.wayOut([0, 0, -4])
    r.steps([{ hint: { en: 'look', fi: 'katso' }, at: [0, 0, 0], done: () => false }])
  }
}

/** Nothing more than the house's floor. */
const bare = () => {}
/** A ledge's height: more than a jump lifts the feet from the floor, and a player on it still under the room's top. */
const LEDGE = 1.7

/** One bot goes to a named handle (or a point) from high up; what became of it. */
function goOne(code: RoomCode, to: string | Point, secs: number) {
  const walk: WalkCode = function* (bots, w) {
    yield* bots[0].goTo(typeof to === 'string' ? w.get(to) : to)
  }
  return walkInView(code, 1, walk, null, secs, 'high')
}

const feet = (w: { players: readonly { at: readonly number[] }[] }) => w.players[0].at

describe('goTo from high up', () => {
  it('walks across the floor at a slant to a point, as fast as a child walks', () => {
    const { room: r, run } = goOne(room([[-6, 0, 3]], bare), [5, 0, -3], 20)
    expect(run.sentence).toBeNull()
    expect(run.state).toBe('done')
    const [x, , z] = feet(r.world)
    expect(Math.sqrt((x - 5) ** 2 + (z + 3) ** 2)).toBeLessThanOrEqual(0.4)
    expect(r.world.t).toBeLessThan(Math.sqrt(11 * 11 + 6 * 6) / FEEL.walk + 1)
  })

  it('walks round a wall to the point behind it', () => {
    const { room: r, run } = goOne(
      room([[-4, 0, 0]], (b) => void b.box([0, 1, -0.75], [0.6, 2, 6.5], { name: 'wall' })),
      [4, 0, 0],
      30,
    )
    expect(run.sentence).toBeNull()
    expect(feet(r.world)[0]).toBeGreaterThan(3.5)
  })

  it("climbs a ramp rising 'back' (toward -z) onto a terrace", () => {
    const { room: r, run } = goOne(
      room([[0, 0, 3]], (b) => {
        b.box([0, 0.5, -3], [4, 1, 2], { name: 'terrace' })
        b.ramp([0, 0.5, -0.75], [2, 1, 2.5], 'back', {})
      }),
      'terrace',
      30,
    )
    expect(run.sentence).toBeNull()
    expect(feet(r.world)[1]).toBeCloseTo(1, 6)
  })

  /** Two ledges with a gap between them along x, `across` metres wide, over the house's floor. */
  const pit = (across: number) =>
    room([[-5, LEDGE, 0]], (b) => {
      b.box([-4.5, LEDGE / 2, 0], [5, LEDGE, 8], { name: 'near' })
      b.box([-2 + across + 2.5, LEDGE / 2, 0], [5, LEDGE, 8], { name: 'far' })
    })

  it('jumps a gap of 0.6 m between ledges with a running jump, the room\'s top stopping its rise', () => {
    const { room: r, run } = goOne(pit(0.6), 'far', 20)
    expect(run.sentence).toBeNull()
    expect(feet(r.world)[0]).toBeGreaterThan(-1.4)
    expect(feet(r.world)[1]).toBeCloseTo(LEDGE, 6)
  })

  it('refuses a gap of 1.2 m between ledges, saying the gap across the floor and what a jump under the room\'s top reaches, in metres', () => {
    const { run } = goOne(pit(1.2), 'far', 30)
    expect(run.state).toBe('stopped')
    expect(run.sentence).toMatch(/^bot 0 found no way from -?[\d.]+, 1.7, -?[\d.]+ to the solid 'far' at 1.7, 0.9, 0: the gap from -2, 1.7, -?[\d.]+ is 1.2 m across and 0 m up, and a jump carries the feet 0.9 m across at that height$/)
  })

  /** Two square ledges `size` m wide set corner to corner, `across` m apart at their corners, the bot in the middle of the near one. */
  const corners = (size: number, across: number) => {
    const c = across / Math.SQRT2 / 2 + size / 2
    return room([[-c, LEDGE, c]], (b) => {
      b.box([-c, LEDGE / 2, c], [size, LEDGE, size], { name: 'near' })
      b.box([c, LEDGE / 2, -c], [size, LEDGE, size], { name: 'far' })
    })
  }

  it('jumps a gap of 0.6 m from corner to corner between ledges', () => {
    const { room: r, run } = goOne(corners(3, 0.6), 'far', 20)
    expect(run.sentence).toBeNull()
    expect(feet(r.world)[0]).toBeGreaterThan(0.2)
    expect(feet(r.world)[1]).toBeCloseTo(LEDGE, 6)
  })

  const box = (high: number) =>
    room([[-4, 0, 0]], (b) => {
      b.box([2, high / 2, 0], [2, high, 2], { name: 'top' })
    })

  it('jumps up onto a top 1.5 m high', () => {
    const { room: r, run } = goOne(box(1.5), 'top', 20)
    expect(run.sentence).toBeNull()
    expect(feet(r.world)[1]).toBeCloseTo(1.5, 6)
  })

  it('refuses a top 1.8 m high, saying how high it is and how high a jump lifts the feet', () => {
    const { run } = goOne(box(1.8), 'top', 20)
    expect(run.state).toBe('stopped')
    expect(run.sentence).toMatch(/: from -?[\d.]+, 0, -?[\d.]+ the floor above, at -?[\d.]+, 1.8, -?[\d.]+, is 1.8 m up, and a jump lifts the feet 1.6 m$/)
  })

  it('refuses a wall with no way round, naming the wall, where it stands on the floor and how high', () => {
    const { run } = goOne(
      room([[-4, 0, 0]], (b) => void b.box([0, 1.25, 0], [0.6, 2.5, 8], { name: 'wall' })),
      [4, 0, 0],
      20,
    )
    expect(run.state).toBe('stopped')
    expect(run.sentence).toMatch(/^bot 0 found no way from -?[\d.]+, 0, -?[\d.]+ to 4, 0, 0: between -?[\d.]+, 0, -?[\d.]+ and -?[\d.]+, 0, -?[\d.]+ the solid 'wall' \(x -0.3 to 0.3, z -4 to 4\) stands up to y 2.5, and a jump lifts the feet 1.6 m$/)
  })

  it('rides a mover that slides across a gap too wide to jump between ledges, waiting for it to come', () => {
    const { room: r, run } = goOne(
      room([[-6, LEDGE, 0]], (b) => {
        b.box([-5.5, LEDGE / 2, 0], [3, LEDGE, 8], { name: 'near' })
        b.box([5.5, LEDGE / 2, 0], [3, LEDGE, 8], { name: 'far' })
        // A raft from x -2.85 to 2.85 and back, every 8 s, its top flush with the ledges and its ends coming to within 0.15 m of them: under the room's top a jump from a ledge carries the feet little more than half a metre.
        b.mover(
          () => b.box([0, -0.15, 0], [2, 0.3, 2], { name: 'raft' }),
          (t) => ({ at: [-2.85 + 2.85 * (1 - cos((t / 8) * 2 * Math.PI)), LEDGE, 0] }),
          {},
        )
      }),
      'far',
      40,
    )
    expect(run.sentence).toBeNull()
    expect(feet(r.world)[0]).toBeGreaterThan(4)
  })

  it('carries a thing to a zone, setting it down with its middle over the zone, and pushes a heavy crate to a point', () => {
    const code = room([[-5, 0, 0]], (b) => {
      b.thing([-2, 0, 2], cube(0.4, 0.4, 0.4), { name: 'ball' })
      b.zone([4, 0.5, 3], [2, 1, 2], { name: 'goal' })
      b.thing([0, 0, -2], cube(0.8, 0.8, 0.8), { name: 'crate', weight: 1 })
    })
    const walk: WalkCode = function* (bots, w) {
      const got = yield* bots[0].carry(w.get('ball') as ThingView, w.get('goal'))
      if (!got) throw new Error('not carried')
      const pushed = yield* bots[0].push(w.get('crate') as ThingView, [-4, 0, -2])
      if (!pushed) throw new Error('not pushed')
    }
    const { room: r, run } = walkInView(code, 1, walk, null, 60, 'high')
    expect(run.sentence).toBeNull()
    expect(run.state).toBe('done')
    const [ball, crate] = r.world.things
    expect(Math.abs(ball.at[0] - 4)).toBeLessThan(1)
    expect(Math.abs(ball.at[2] - 3)).toBeLessThan(1)
    expect(Math.sqrt((crate.at[0] + 4) ** 2 + (crate.at[2] + 2) ** 2)).toBeLessThanOrEqual(0.5 + 0.4)
  })

  it('says each place in its sentences as x, y, z', () => {
    expect(WALK_MISTAKES.noWay(0, '1, 2, 3', 'there', 'a gap', 'a reach')).toBe('bot 0 found no way from 1, 2, 3 to there: a gap, and a reach')
  })

  it('has lines that say where it differs from the side', () => {
    expect(BOT_REF.steer).toContain('from high up its up walks toward -z')
    expect(BOT_REF.carry).toContain('from high up, with its middle over the zone')
    expect(BOT_REF.push).toContain('from high up across the floor')
    expect(WALK_PREAMBLE).toContain('Seen from high up, goTo walks and jumps any way across the floor')
  })
})
