import { expect } from 'vitest'

import { BOWL_PER_MUNCHER, PART_INFO } from './catalog'
import { PARTS, THINGS, type SimEvent, type State, type Thing } from './model'

/**
 * The ledger for the tests that play whole games (ledger.test.ts, play.test.ts;
 * plans/rocket-factory.md, Engineering): everything dug and pumped equals what is on belts,
 * in buildings, in the rocket, in cheeks, on heaps and in the basket, plus what was drunk,
 * eaten at picnics, shot by towers and launched. Never used by the game itself.
 */

/** Raw content in [blue, gold, bubble]: a gear is two blue bars, a green bottle a blue and a gold bar, an orange bottle a gear and a bubble. */
const RAW: Record<Thing, readonly [number, number, number]> = {
  blueRock: [1, 0, 0],
  goldRock: [0, 1, 0],
  bubble: [0, 0, 1],
  blueBar: [1, 0, 0],
  goldBar: [0, 1, 0],
  gear: [2, 0, 0],
  greenBottle: [1, 1, 0],
  orangeBottle: [2, 0, 1],
}
const plus = (sum: number[], t: Thing, n: number) => RAW[t].forEach((v, i) => (sum[i]! += v * n))

/** Everything the state holds, in raw units: on the belts, in the buildings (inputs, an oven's queue, a batch in progress, the roof stack, the lab's shelf, a tower's bubbles, a bowl's bars), in the rocket, in cheeks, on heaps and in the basket. Flights are pictures: what flies is already where it went. */
function content(s: State): number[] {
  const sum = [0, 0, 0]
  for (const v of s.belts.slot) if (v >= 0) plus(sum, THINGS[v]!, 1)
  for (const b of s.buildings) {
    b.held.forEach((n, k) => plus(sum, THINGS[k]!, n))
    for (const t of [...b.queue, ...b.stack]) plus(sum, t, 1)
    if (b.batch !== null) plus(sum, b.batch.makes, 1)
  }
  s.rocket.got.forEach((n, i) => plus(sum, PART_INFO[PARTS[i]!].thing, n))
  for (const m of s.munchers) for (const t of m.cheeks) plus(sum, t, 1)
  for (const b of s.burrows) b.heap.forEach((n, k) => plus(sum, THINGS[k]!, n))
  s.basket.forEach((n, k) => plus(sum, THINGS[k]!, n))
  return sum
}

/**
 * What the game was seen to make and use, from its events, in raw units: `made` is what Beep
 * dug and what diggers and the pump made (a digger's batch is its rock from the start, a
 * pump's its bubble), `used` what the lab drank, what picnics ate, the bubbles towers shot
 * (one a second shot: a tower holds a bubble until its second shot goes, and gives a bubble
 * shot once back whole when peeled) and what flew in the rocket. `seen` counts the events by
 * kind, so a test can say the game did what the ledger counts.
 */
export class Ledger {
  made = [0, 0, 0]
  used = [0, 0, 0]
  /** Each tower on the board and its shots since it was placed. */
  private shots = new Map<number, number>()
  readonly seen: Record<string, number> = {}

  constructor(s: State) {
    this.made = content(s)
  }

  /** The events of one step (or of the actions before it), with the state they came in. */
  read(s: State, events: readonly SimEvent[]): void {
    for (const e of events) {
      this.seen[e.kind] = (this.seen[e.kind] ?? 0) + 1
      switch (e.kind) {
        case 'dig':
          plus(this.made, e.thing, 1)
          break
        case 'batch': {
          const b = s.buildings.find((x) => x.id === e.id)!
          if (b.kind === 'digger' || b.kind === 'pump') plus(this.made, b.batch!.makes, 1)
          break
        }
        case 'drink':
          plus(this.used, e.bottle, 1)
          break
        case 'picnic':
          plus(this.used, 'goldBar', BOWL_PER_MUNCHER)
          break
        case 'shot': {
          const n = (this.shots.get(e.tower) ?? 0) + 1
          this.shots.set(e.tower, n)
          if (n % 2 === 0) plus(this.used, 'bubble', 1)
          break
        }
        case 'landed':
          for (const p of PARTS) plus(this.used, PART_INFO[p].thing, PART_INFO[p].n)
          break
        default:
          break
      }
    }
    // A tower peeled off: its count starts again if Oops puts it back, its bubbles all handed back whole.
    for (const id of this.shots.keys()) if (!s.buildings.some((b) => b.id === id)) this.shots.delete(id)
  }

  /** What the state holds now plus what was used: everything made. */
  check(s: State): void {
    const have = content(s).map((n, i) => n + this.used[i]!)
    expect(have, `the ledger at tick ${s.tick}`).toEqual(this.made)
  }
}
