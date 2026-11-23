/**
 * Magic House: the base of the broken twins seen from high up (step 6). A room for one player
 * written as made code, as a designer writes it from the reference for a request that says "seen
 * from high up": the body of function (r, w) and its walkthrough, plain text that uses only the
 * reference's calls and the guard's allowed names, no imports. It goes through the guard
 * (server/codeKinds.ts) and the compile (trial/compile.ts) as a room from the line does, and passes
 * the whole trial at every level (highTwins.test.ts). Each of HIGH_TWINS (twins.ts) is a small edit
 * of this text.
 *
 * Egg Islands: a meadow with a nest, a pond, and across it an island with a hedge to walk round, and
 * off the island's far end a rock to jump up on. The house's floor is the meadow, the pond's bed and
 * the shore round the rock; the island and the rock are raised floors, laid for the jumps the room's
 * top at 3 m cuts short: the island low enough to jump up onto from the floor and to jump on from,
 * the rock too high to reach from the floor, a short hop from the island. The player carries the
 * eggs home to the nest one at a time, 17, 19 or 21 by level.
 */

import type { TrialJob } from '../../protocol'

/** What the base's trial job carries besides its code: one player, from high up, in its shell, asked at level 1. */
export const HIGH_JOB: Omit<TrialJob, 'room' | 'walk'> = {
  line: 'high-twins',
  attempt: 1,
  party: 1,
  seed: 610,
  roll: { kind: 'together', view: 'high' },
  level: 1,
  shell: {
    walls: { color: '#bfe8ff', second: '#bfe8ff', pattern: 'plain' },
    floor: { color: '#8fd16a', second: '#8fd16a', pattern: 'plain' },
    ceiling: { color: '#bfe8ff', second: '#bfe8ff', pattern: 'plain' },
    trim: '#ffffff',
    light: 0.9,
  },
}

/** The room: the body of function (r, w). */
export const HIGH_ROOM = `const level = w.level()
const players = w.players()
const eggCount = [17, 19, 21][level - 1]

// The pond on the meadow, the island across it, and the rock across a channel off the island's far end.
r.decor([-3, 0, 0], (m) => m.box(2, 0.02, 8, { at: [0, 0.01, 0], color: '#4fb3e8' }))
r.box([1, 0.4, 0], [6, 0.8, 8], { color: '#7cc659', name: 'island' })
r.box([5.8, 0.85, 2.5], [2.4, 1.7, 2], { color: '#a59a8a', name: 'rock' })

// On the island: a hedge to walk round, higher than a jump from the island or an egg's top.
r.box([1, 1.85, -1.5], [0.6, 2.1, 5], { color: '#3f8f3a', name: 'hedge' })

// The nest on the meadow, and its count.
r.decor([-5.5, 0, -2.5], (m) => {
  m.cylinder(1, 1.1, 0.25, { at: [0, 0.12, 0], color: '#a4743f' })
  m.cylinder(0.75, 0.75, 0.05, { at: [0, 0.26, 0], color: '#c99a5b' })
})
const nest = r.zone([-5.5, 0.5, -2.5], [2.2, 1, 2.2], { name: 'nest' })
const count = r.sign([-5.5, 2, -3.6], { count: 0, of: eggCount })

// The eggs, where they wait.
const spots = [
  [-1, 0.8, -3],
  [-0.5, 0.8, 3],
  [6, 1.7, 2.5],
  [3, 0.8, -3.2],
  [3.5, 0.8, -0.5],
  [-1.2, 0.8, 0.5],
  [2.5, 0.8, 3.2],
  [5.5, 0, -3.2],
  [0, 0.8, -1.2],
  [6.5, 0, -0.5],
  [3.2, 0.8, 1.6],
  [-1.4, 0.8, -1.8],
  [2, 0.8, -2],
  [5, 0, -1.8],
  [0.2, 0.8, 1.8],
  [3.6, 0.8, 3.4],
  [-1.5, 0.8, 3.4],
  [6.6, 0, -3.4],
  [2.6, 0.8, -0.8],
  [-0.4, 0.8, -3.4],
  [4.4, 0, -2.6],
]
const eggModel = (m) => {
  m.sphere(0.18, { at: [0, 0.23, 0], scale: [1, 1.3, 1], color: '#fff6e0' })
  m.sphere(0.05, { at: [0.08, 0.32, 0.12], color: '#e9b8ff' })
}
const eggs = spots.slice(0, eggCount).map((at, i) => r.thing(at, eggModel, { name: 'egg-' + (i + 1) }))

players[0].putAt([-5, 0, 2])
r.wayOut([-6.4, 0, -4])

let home = 0
r.steps([
  { hint: { en: 'Jump over the water', fi: 'Hyppää veden yli' }, at: [-3, 0, 0], done: () => players[0].at()[0] > -1.6 && players[0].standingOn() !== null },
  { hint: { en: 'Bring the eggs to the nest', fi: 'Vie munat pesään' }, at: nest, done: () => home === eggCount },
])

return () => {
  const now = eggs.filter((e) => e.heldBy() === null && nest.has(e)).length
  if (now > home) {
    w.sound('ding')
    w.puff(nest.at(), 'star', { count: 12 })
  }
  if (now !== home) {
    home = now
    count.write({ count: home, of: eggCount })
  }
  if (home === eggCount) w.finish()
}`

/** The walkthrough: the body of function* (bots, w). The one bot carries each egg home in turn. */
export const HIGH_WALK = `const eggCount = [17, 19, 21][w.level() - 1]
for (let i = 1; i <= eggCount; i++) yield* bots[0].carry(w.get('egg-' + i), w.get('nest'))`
