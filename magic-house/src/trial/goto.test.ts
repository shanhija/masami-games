/**
 * goTo on small rooms built with the builder: the search behind it (trial/search.ts) walks, steps up,
 * jumps gaps as wide as a running jump clears and refuses wider ones with the sentence from the floor
 * graph (trial/graph.ts), jumps up through floors one jumps through, walks ramps it can and refuses
 * one too steep, crosses ice and belts, rides a bounce, a moving platform and a lift (boarded from either side), waits for a
 * mover, stands on another bot's head for a boost, and flies a fly stick.
 */

import { describe, expect, it } from 'vitest'
import { FEEL, type Builder, type Point, type RoomCode, type SolidOpts, type World } from '../engine/api'
import { cos, sin, tan } from '../engine/math'
import type { WalkCode } from './api'
import { walkIn } from './testing'

/** The room every test builds on: the room's one box (engine/api.ts ROOM) on the house's floor, the players at their starts, the way out, and one step never done. */
function room(starts: readonly Point[], build: (r: Builder, w: World) => void): RoomCode {
  return (r, w) => {
    build(r, w)
    w.players().forEach((p, i) => p.putAt(starts[i]))
    r.wayOut([-7, 0, 0])
    r.steps([{ hint: { en: 'look', fi: 'katso' }, at: [0, 0, 0], done: () => false }])
  }
}

/** A ledge from x0 to x1 whose top is at y, standing on the house's floor. */
const ledge = (r: Builder, x0: number, x1: number, y: number, opts: SolidOpts) => r.box([(x0 + x1) / 2, y / 2, 0], [x1 - x0, y, 2], opts)
/** Nothing more than the house's floor. */
const bare = () => {}

/** One bot goes to a named handle (or a point); what became of it. */
function goOne(code: RoomCode, to: string | Point, secs: number) {
  const walk: WalkCode = function* (bots, w) {
    yield* bots[0].goTo(typeof to === 'string' ? w.get(to) : to)
  }
  return walkIn(code, 1, walk, null, secs)
}

const at = (w: { players: readonly { at: readonly number[] }[] }, seat: number) => w.players[seat].at

describe('goTo', () => {
  it('walks along a floor to a point, as fast as a child walks', () => {
    const { room: r, run } = goOne(
      room([[-7, 0, 0]], bare),
      [6, 0, 0],
      20,
    )
    expect(run.state).toBe('done')
    expect(Math.abs(at(r.world, 0)[0] - 6)).toBeLessThanOrEqual(0.4)
    expect(r.world.t).toBeLessThan(13 / FEEL.walk + 1)
  })

  it(`steps up a step of ${FEEL.stepUp} m`, () => {
    const { room: r, run } = goOne(
      room([[-7, 0, 0]], (b) => void ledge(b, 2, 8, FEEL.stepUp, { name: 'step' })),
      'step',
      20,
    )
    expect(run.state).toBe('done')
    expect(at(r.world, 0)[1]).toBeCloseTo(FEEL.stepUp, 6)
  })

  /** Two ledges higher than a jump lifts, a gap between them over the house's floor. */
  const gap = (across: number) =>
    room([[-4, 2, 0]], (b) => {
      ledge(b, -8, 0, 2, {})
      ledge(b, across, 8, 2, { name: 'far' })
    })

  it('crosses a gap of 3.1 m with a running jump', () => {
    const { room: r, run } = goOne(gap(3.1), 'far', 20)
    expect(run.sentence).toBeNull()
    expect(run.state).toBe('done')
    expect(at(r.world, 0)[0]).toBeGreaterThan(3.1)
  })

  it('refuses a gap of 3.2 m, saying the gap and what a jump reaches', () => {
    const { run } = goOne(gap(3.2), 'far', 60)
    expect(run.state).toBe('stopped')
    // It stays on its ledge rather than drop onto the house's floor between them, from where it could not climb back, and says the gap from there.
    expect(run.sentence).toMatch(/^bot 0 found no way from -?\d+(\.\d)?, 2 to the solid 'far' at /)
    expect(run.sentence).toContain('is 3.2 m across and 0 m up')
    expect(run.sentence).toContain('a jump carries the feet 3.1 m across at that height')
  })

  it('refuses a ledge too high to jump onto, saying how high it is and how high a jump lifts', () => {
    const { run } = goOne(
      room([[-4, 0, 0]], (b) => void b.box([6, 0.9, 0], [4, 1.8, 2], { name: 'ledge' })),
      'ledge',
      60,
    )
    expect(run.state).toBe('stopped')
    expect(run.sentence).toContain('1.8 m up')
    expect(run.sentence).toContain(`a jump lifts the feet ${FEEL.jumpHigh} m`)
  })

  it('jumps up through a floor one jumps through, from right under it', () => {
    const { room: r, run } = goOne(
      room([[0, 0, 0]], (b) => void b.box([0, 1.3, 0], [4, 0.2, 2], { through: true, name: 'shelf' })),
      'shelf',
      20,
    )
    expect(run.state).toBe('done')
    expect(at(r.world, 0)[1]).toBeCloseTo(1.4, 6)
  })

  it(`walks up a ramp of 30 degrees, and refuses one too steep (over ${FEEL.slope}) to a ledge too high to jump`, () => {
    const ramp = (w: number) =>
      room([[-6, 0, 0]], (b) => {
        b.ramp([3 + w / 2, 1, 0], [w, 2, 2], 'right')
        b.box([(3 + w + 8) / 2, 1, 0], [8 - 3 - w, 2, 2], { name: 'top' })
      })
    const gentle = goOne(ramp(2 / tan(Math.PI / 6)), 'top', 20)
    expect(gentle.run.state).toBe('done')
    expect(at(gentle.room.world, 0)[1]).toBeCloseTo(2, 6)
    const steep = goOne(ramp(2 / tan(Math.PI / 3)), 'top', 60)
    expect(steep.run.state).toBe('stopped')
    expect(steep.run.sentence).toContain('found no way')
  })

  it('crosses ice and stops on it', () => {
    const { room: r, run } = goOne(
      room([[-7, 0, 0]], (b) => void ledge(b, 0, 8, 0.1, { ice: true })),
      [6, 0.1, 0],
      20,
    )
    expect(run.state).toBe('done')
    expect(Math.abs(at(r.world, 0)[0] - 6)).toBeLessThanOrEqual(0.4)
  })

  it('walks across a belt that carries against it', () => {
    const { room: r, run } = goOne(
      room([[-7, 0, 0]], (b) => void ledge(b, 0, 5, 0.1, { belt: [-2, 0, 0] })),
      [7, 0, 0],
      20,
    )
    expect(run.state).toBe('done')
    expect(Math.abs(at(r.world, 0)[0] - 7)).toBeLessThanOrEqual(0.4)
  })

  it('rides a bounce up to a ledge no jump reaches', () => {
    const { room: r, run } = goOne(
      room([[-6, 0, 0]], (b) => {
        b.box([0, 0.15, 0], [1.6, 0.3, 2], { bounce: 3.5 })
        b.box([4.5, 1.65, 0], [5, 3.3, 2], { name: 'high' })
      }),
      'high',
      30,
    )
    expect(run.sentence).toBeNull()
    expect(run.state).toBe('done')
    expect(at(r.world, 0)[1]).toBeCloseTo(3.3, 6)
  })

  /** Two ledges higher than a jump lifts, too far apart to jump between, and a ferry from one to the other at their height. */
  const ferry = (speed: number) =>
    room([[-6, 2, 0]], (b) => {
      ledge(b, -8, -3, 2, {})
      ledge(b, 3, 8, 2, { name: 'far' })
      b.mover(
        () => b.box([0, -0.1, 0], [2, 0.2, 2]),
        (t) => ({ at: [3.5 * sin(t * speed), 2, 0] }),
        { name: 'ferry' },
      )
    })

  it('rides a moving platform across a gap too wide to jump', () => {
    const { room: r, run } = goOne(ferry(0.8), 'far', 60)
    expect(run.sentence).toBeNull()
    expect(run.state).toBe('done')
    expect(at(r.world, 0)[0]).toBeGreaterThan(3)
  })

  it('waits for a slow platform at the edge, then rides it', () => {
    const { room: r, run, inputs } = goOne(ferry(0.25), 'far', 90)
    expect(run.sentence).toBeNull()
    expect(run.state).toBe('done')
    expect(at(r.world, 0)[0]).toBeGreaterThan(3)
    // Somewhere it stood still for a second and more, letting the platform come.
    let longest = 0
    let run0 = 0
    for (const input of inputs) {
      run0 = input.pads[0].stick[0] === 0 && !input.pads[0].a.held ? run0 + 1 : 0
      longest = Math.max(longest, run0)
    }
    expect(longest).toBeGreaterThan(60)
  })

  it('rides a lift up to a roof', () => {
    const { room: r, run } = goOne(
      room([[-6, 0, 0]], (b) => {
        b.box([5, 2, 0], [6, 4, 2], { name: 'roof' })
        b.mover(
          () => b.box([0, 0.1, 0], [1.6, 0.2, 2]),
          (t) => ({ at: [1.2, 1.9 - 1.9 * cos(t * 0.8), 0] }),
        )
      }),
      'roof',
      60,
    )
    expect(run.sentence).toBeNull()
    expect(run.state).toBe('done')
    expect(at(r.world, 0)[1]).toBeCloseTo(4, 6)
  })

  it('boards a lift from the side away from where it goes, then leaves it for a ledge above that side', () => {
    // The ledge is beside the lift on the bot's side, too high to jump to: the way first goes away from the ledge onto the lift,
    // and every copy jumping toward the ledge looks as good to the graph as one boarding (Star Rocket, the first library round).
    const { room: r, run } = goOne(
      room([[7.5, 0, 0]], (b) => {
        b.box([5.5, 3.8, 0], [5, 0.4, 2], { name: 'ledge' })
        b.mover(
          () => b.box([0, 0, 0], [2, 0.3, 2]),
          (t) => ({ at: [1, 0.15 + 1.85 * (1 - cos(0.7 * t)), 0] }),
        )
      }),
      [3.6, 4, 0],
      60,
    )
    expect(run.sentence).toBeNull()
    expect(run.state).toBe('done')
    expect(at(r.world, 0)[1]).toBeCloseTo(4, 6)
    // A lift round in 9 s, and the walk to it 3 s: never minutes of standing beside it.
    expect(r.world.t).toBeLessThan(25)
  })

  it("stands on another bot's head for a boost up to a shelf no jump reaches", () => {
    const code = room(
      [
        [-6, 0, 0],
        [-4, 0, 0],
      ],
      (b) => void b.box([5.5, 1.25, 0], [5, 2.5, 2], { name: 'shelf' }),
    )
    const walk: WalkCode = function* (bots, w) {
      yield* bots[1].goTo([2.4, 0, 0])
      yield* bots[0].goTo(w.get('shelf'))
    }
    const { room: r, run } = walkIn(code, 2, walk, null, 40)
    expect(run.sentence).toBeNull()
    expect(run.state).toBe('done')
    expect(at(r.world, 0)[1]).toBeCloseTo(2.5, 6)
  })

  it('flies a fly stick to a point in the air', () => {
    const code: RoomCode = (r, w) => {
      room([[-6, 0, 0]], bare)(r, w)
      r.controls(w.players(), { stick: 'fly', a: 'grab', b: null })
    }
    const { room: r, run } = goOne(code, [4, 5, 0], 20)
    expect(run.state).toBe('done')
    const p = at(r.world, 0)
    expect((p[0] - 4) ** 2 + (p[1] - 5) ** 2).toBeLessThanOrEqual(0.4 * 0.4)
  })
})
