/**
 * Magic House's own room for two players: Apple Kitchen (its id is still own:seesaw-orchard, so saves
 * match). A sunny farmhouse kitchen where two apple trees grow in tubs by the walls, with a big seesaw
 * between them on the kitchen floor. The apples hang under the trees' branches, far too high to jump
 * to. One player stands on an end of the seesaw and the other jumps onto the other end: the one
 * standing flies up into the tree on their side, and every branch they land on shakes its apples
 * down. The higher the jump that lands on the seesaw, the higher the throw: from the floor to the
 * lowest branch, from the stool or the footstool to the middle one, from the stove or the sink's counter
 * to the top one. Each tree is reached only from its own end, so both players take a turn flying, and
 * neither can fly alone. Then each apple is washed in the sink on the right and put in the pie dish on
 * the stove on the left, and when the dish is full the apple pie bakes. Level adds apples (10, 14
 * and 18), and every apple is two trips across the kitchen, so more apples is more to do, never more
 * to wait for: the bots' clean pass takes 70 s, 83 s and 100 s. The two players carry side by side,
 * so each level adds two apples to each tree, one more for each of them.
 *
 * Laid inside the house's box (engine/api.ts ROOM: x -8 to 8, y 0 to 8). Each side has a seat a
 * little higher than the floor and a top a little higher than the seat beside the seesaw's end, the
 * stomper's three places to jump from; the branches start above what a jump from the top reaches, and
 * each is higher above the one below than a jump, so a branch is reached only by a throw, and from a
 * branch a player drops back to the floor. An apple hangs as decor, the apple to carry hidden in its
 * place until its branch is shaken, so nothing hanging is in a jumper's way. No apple hangs over a
 * lower branch, the sink or the pie dish, so a shaken apple lands on a seat, a top or the floor. The
 * seats and tops are plain solids with no colour of their own, which the look
 * (seesaw-orchard.look.ts) dresses as a stool, a stove, a footstool and the sink's counter; what the play
 * colours (the seesaw, the trees, the apples, the dish) is what the players play with. The kitchen's
 * furniture, things and lights are the look's.
 *
 * Written by hand against the builder (engine/api.ts), as a designer's room would be; never shown
 * to the model (plan.md, How Opus is asked).
 */

import type { Decor, MoverView, Player, Point, RoomCode, Solid, Thing, ThingView, Who } from '../../engine/api'
import type { Model } from '../../engine/gift'
import type { WalkCode } from '../../trial/api'
import type { OwnFacts } from './facts'

export const facts: OwnFacts = {
  id: 'own:seesaw-orchard',
  party: 2,
  seed: 202,
  kind: 'together',
  view: 'side',
  theme: 'a sunny farmhouse kitchen where two apple trees grow, with a big seesaw between them',
  task: 'take turns flying each other up into the trees with the seesaw, and fill the pie dish with apples',
  name: { en: 'Apple Kitchen', fi: 'Omenakeittiö' },
  shell: {
    walls: { color: '#fff1cf', second: '#f7dc9e', pattern: 'checks' },
    floor: { color: '#c98f5a', second: '#b77c48', pattern: 'stripes' },
    ceiling: { color: '#fff8e6', second: '#fff8e6', pattern: 'plain' },
    trim: '#d9534f',
    light: 1,
  },
}

/** The seesaw: its pivot, and each half's length; the plank's top at rest. Each half has a handle at its middle, behind the plank. */
const PIVOT: Point = [0, 0.5, 0]
const HALF = 2.6
const PLANK_TOP = 0.6
/** Where the flier stands on their half: its middle. */
const FLIER_X = HALF / 2
/** How fast a player must have been falling to throw the other end up, m/s: any jump onto it, never a walk. */
const STOMP = 1.5

/** Beside each end of the seesaw: a seat and a top to jump from, as [middle x, width, top] on the right (mirrored on the left). */
const SEAT = { x: 3.6, w: 0.6, top: 0.6 } as const
const TOP = { x: 4.8, w: 1.4, top: 1.2 } as const
/** Where the stomper stands on the floor to jump onto the seesaw's end: between the end and the seat. */
const FLOOR_SPOT = 2.95

/**
 * The right tree's branches, mirrored for the left tree, lowest first. The lowest is above what a
 * held jump from the top reaches (TOP.top + FEEL.jumpHigh 1.6 = 2.8), each the next 1.7 m above it,
 * more than a jump, and the top one leaves a child's head under the ceiling. Each has its apples, none
 * over a lower branch or over a top, where the sink and the pie dish stand: at level 1 two, two and
 * one, at level 2 three, two and two, at level 3 three, three and three (the first `count` of each list).
 */
const BRANCHES: readonly { x: number; top: number; w: number; apples: readonly number[]; count: readonly number[] }[] = [
  { x: 4, top: 3.1, w: 2, apples: [3.45, 3.85, 3.05], count: [2, 3, 3] },
  { x: 5.6, top: 4.8, w: 2, apples: [5.7, 6.5, 6.1], count: [2, 2, 3] },
  { x: 7.05, top: 6.5, w: 1.7, apples: [6.9, 7.3, 7.7], count: [1, 2, 3] },
]
/** How far above its branch a throw lifts the feet at its highest, and how the ceiling caps it (the room's 8 m less a child). */
const LIFT = 0.7
const HIGHEST = 8 - 1.15 - 0.05
const GRAVITY = 20
/**
 * How the seesaw throws: the higher the jump that lands on one end, the higher the other end throws
 * whoever stands on it. A jump from the floor falls 1 m onto the plank, from a seat 1.6 m, from a top
 * 2.2 m. Each throw is [the least fall, metres; up and across, m/s]: up to LIFT over its branch (or the
 * ceiling, the highest), and across so that from the middle of the end they come down on it.
 */
const THROWS: readonly { fall: number; up: number; across: number }[] = BRANCHES.map((b, i) => {
  const peak = Math.min(b.top + LIFT, HIGHEST)
  const up = Math.sqrt(2 * GRAVITY * (peak - PLANK_TOP))
  const secs = up / GRAVITY + Math.sqrt((2 * (peak - b.top)) / GRAVITY)
  return { fall: [0, 1.3, 1.9][i], up, across: (b.x - FLIER_X) / secs }
})

/** The pie dish on the left side's top, the sink in the right side's: where the dish stands, and how many apples fit in a row in it. */
const DISH_X = -TOP.x
const IN_ROW = 4
/** How a washed apple shines. */
const CLEAN = '#fff6d8'
/** Where each tree's trunk stands, by the wall, behind the play. */
const TRUNK_X = 7.45
const TREE_Z = -1.7

const APPLE: Model = (m) => {
  m.sphere(0.2, { at: [0, 0.2, 0], color: '#e8322f' })
  m.sphere(0.06, { at: [-0.07, 0.29, 0.15], color: '#ff8a80' })
  m.cylinder(0.02, 0.02, 0.12, { at: [0, 0.44, 0], color: '#6b4226' })
  m.sphere(0.07, { at: [0.08, 0.46, 0], scale: [1.4, 0.5, 0.8], color: '#4caf50' })
}

/** How far under its branch's bottom an apple's foot hangs; it hangs from a stalk up to the branch. */
const HANG = 0.55
const HANGING_APPLE: Model = (m) => {
  APPLE(m)
  m.cylinder(0.015, 0.015, HANG - 0.42, { at: [0, 0.42 + (HANG - 0.42) / 2, 0], color: '#6b4226' })
}

const PLANK: Model = (m) => {
  m.box(HALF, 0.2, 1.1, { at: [0, 0.1, 0], color: '#e0913f' })
  m.box(0.5, 0.06, 1.12, { at: [0, 0.18, 0], color: '#f3b468' })
  m.cylinder(0.08, 0.08, 0.5, { at: [0, 0.4, -0.45], color: '#d9534f' })
}

/** The seesaw's stand under the plank's middle, red like the room's trim, with its axle. */
const STAND: Model = (m) => {
  m.extrude(
    [
      [-0.55, 0],
      [0.55, 0],
      [0.1, 0.42],
      [-0.1, 0.42],
    ],
    0.9,
    { color: '#c2403b' },
  )
  m.cylinder(0.12, 0.12, 1.2, { at: [0, 0.45, 0], rot: [Math.PI / 2, 0, 0], color: '#8a5a32' })
}

/** A branch to stand on, w wide, with leaves along its back. */
function branch(w: number): Model {
  return (m) => {
    m.box(w, 0.25, 0.6, { at: [0, 0.125, 0], color: '#7a4b2a' })
    for (let x = -w / 2 + 0.4; x < w / 2; x += 0.8) m.sphere(0.34, { at: [x, 0.12, -0.4], scale: [1.2, 0.7, 0.5], color: x < 0 ? '#5cb85c' : '#4fa64f' })
  }
}

/**
 * A tree growing from a tub by the wall, behind the play: its trunk, a limb out to the inner end of
 * each branch (side 1 for the right tree, -1 for the left) and its crown of leaves, all at z -1.7
 * and further back, so a player in front is never hidden; the crown stays high, over the kitchen's
 * walls. Built at the trunk's foot.
 */
function tree(side: 1 | -1): Model {
  return (m) => {
    m.cylinder(0.55, 0.45, 0.8, { at: [0, 0.4, 0], color: '#5b7fb8' })
    m.cylinder(0.6, 0.6, 0.1, { at: [0, 0.8, 0], color: '#4a6aa0' })
    m.cylinder(0.24, 0.32, 6.3, { at: [0, 3.95, 0], color: '#7a4b2a' })
    for (const b of BRANCHES) {
      const inner = side * (b.x - b.w / 2 - TRUNK_X)
      m.cylinder(0.1, 0.16, Math.abs(inner), { at: [inner / 2, b.top - 0.15, 0], rot: [0, 0, Math.PI / 2], color: '#7a4b2a' })
    }
    const leaves: [number, number, number][] = [
      [-0.2, 7.2, 1.2],
      [-1.4, 6.1, 1],
      [-2.6, 5, 0.9],
      [-0.6, 5.3, 1.1],
    ]
    for (const [x, y, r] of leaves) m.sphere(r, { at: [side * x, y, -0.3], scale: [1.2, 0.7, 0.3], color: '#4fa64f' })
  }
}

/** The sink set into the right side's top: a white basin of water, and a tap behind it. */
const SINK: Model = (m) => {
  m.box(1.1, 0.04, 0.9, { at: [0, 0.02, 0], color: '#f4f6f8' })
  m.box(0.9, 0.02, 0.7, { at: [0, 0.045, 0], color: '#6cc3f0' })
  m.cylinder(0.05, 0.05, 0.55, { at: [0, 0.3, -0.5], color: '#c9d3dc' })
  m.cylinder(0.04, 0.04, 0.35, { at: [0, 0.56, -0.35], rot: [Math.PI / 2, 0, 0], color: '#c9d3dc' })
  m.sphere(0.07, { at: [0, 0.6, -0.5], color: '#e04848' })
}

/** The pie dish, with its rim, on the top. */
const DISH: Model = (m) => {
  m.cylinder(0.7, 0.55, 0.22, { at: [0, 0.11, 0], color: '#f2f2f2' })
  m.torus(0.66, 0.06, { at: [0, 0.22, 0], rot: [Math.PI / 2, 0, 0], color: '#5b9bd5' })
}

/** The apple pie the dish becomes, golden with a lattice. */
const PIE: Model = (m) => {
  m.cylinder(0.68, 0.56, 0.3, { at: [0, 0.15, 0], color: '#e0a458' })
  m.cylinder(0.62, 0.68, 0.14, { at: [0, 0.36, 0], color: '#f2c27b' })
  for (const x of [-0.3, 0, 0.3]) m.box(0.08, 0.04, 1.1, { at: [x, 0.44, 0], color: '#d98e3a' })
  for (const z of [-0.3, 0, 0.3]) m.box(1.1, 0.04, 0.08, { at: [0, 0.46, z], color: '#d98e3a' })
}

export const room: RoomCode = (r, w) => {
  const level = w.level()
  const players = w.players()

  // The seats and tops beside each end of the seesaw, plain for the look to dress: a stool and the stove on the left, a footstool and the sink's counter on the right.
  const tops: Solid[] = []
  for (const side of [-1, 1] as const) {
    r.box([side * SEAT.x, SEAT.top / 2, 0], [SEAT.w, SEAT.top, 1], { name: side < 0 ? 'stool' : 'footstool' })
    tops.push(r.box([side * TOP.x, TOP.top / 2, 0], [TOP.w, TOP.top, 1.2], { name: side < 0 ? 'stove' : 'counter' }))
  }

  // The trees, the right one's apples first, then the left's, and the branches they hang under: a player landing on a branch shakes it, and its apples fall.
  const apples: Thing[] = []
  const branches: Solid[] = []
  for (const side of [1, -1] as const) {
    // Tapped, a tree rustles and drops a few leaves, before its turn too.
    r.decor([side * TRUNK_X, 0, TREE_Z], tree(side), {
      tap: () => {
        w.puff([side * (TRUNK_X - 1), 5.5, 0], 'leaf', { count: 10 })
        w.sound('tweet')
      },
    })
    BRANCHES.forEach((b, i) => {
      // Each apple hangs under its branch as decor; the apple to carry is built hidden in its place, so nothing hanging is in anyone's way, and is shown to fall when the branch is shaken.
      const hanging = b.apples.slice(0, b.count[level - 1]).map((x) => {
        const at: Point = [side * x, b.top - 0.25 - HANG, 0]
        const apple = r.thing(at, APPLE, { weight: 0.2, name: `apple-${apples.length + 1}`, hidden: true })
        apples.push(apple)
        return { apple, shown: r.decor(at, HANGING_APPLE) }
      })
      const shake = (who: Who) => {
        if (who.kind() !== 'player') return
        w.puff([side * b.x, b.top, 0], 'leaf', { count: 12 })
        w.sound('boing')
        for (const h of hanging) {
          // Each apple falls once: one already fallen may be hidden again in the pie dish.
          if (h.shown.hidden()) continue
          h.shown.hide()
          h.apple.show()
          h.apple.push([0, -1, 0])
        }
      }
      branches.push(r.box([side * b.x, b.top - 0.125, 0], [b.w, 0.25, 1], { through: true, color: '#7a4b2a', model: branch(b.w), name: `branch-${side < 0 ? 'left' : 'right'}-${i + 1}`, land: shake }))
    })
  }
  const total = apples.length

  // The seesaw: two halves of one plank on a pivot. A player who jumps onto one half throws whoever stands on the other half up toward the tree on that side, the higher the fall the higher the throw. Whoever lands on it tips it with a boing, before their turn too.
  const lastVy = new Map<Player, number>()
  const halves: Solid[] = []
  r.decor([PIVOT[0], 0, 0], STAND)
  const seesaw = r.mover(
    () => {
      halves.push(r.box([-HALF / 2, 0, 0], [HALF, 0.2, 1.1], { color: '#e0913f', model: PLANK, name: 'seesaw-left' }))
      halves.push(r.box([HALF / 2, 0, 0], [HALF, 0.2, 1.1], { color: '#e0913f', model: PLANK, name: 'seesaw-right' }))
    },
    () => ({ at: PIVOT }),
    {
      name: 'seesaw',
      land: (who) => {
        const lander = players.find((p) => p === who)
        const vy = lander === undefined ? 0 : (lastVy.get(lander) ?? 0)
        if (lander === undefined || vy > -STOMP) return
        const fall = (vy * vy) / (2 * GRAVITY)
        const how = THROWS.filter((t) => fall >= t.fall).length - 1
        const fromLeft = lander.at()[0] < PIVOT[0]
        const other = fromLeft ? halves[1] : halves[0]
        const side = fromLeft ? 1 : -1
        seesaw.turnBy(side * (0.15 + 0.05 * how), 0.1)
        w.after(0.5, () => seesaw.turnBy(0, 0.4))
        w.sound('boing')
        for (const p of players) {
          if (p.standingOn() !== other) continue
          p.push([side * THROWS[how].across, THROWS[how].up, 0])
          w.puff(p.at(), 'star', { count: 10 + 6 * how })
          w.sound('whoosh')
        }
      },
    },
  )

  // The sink on the right side's top: an apple set down in it is washed, and shines.
  const washed = new Set<Thing>()
  r.decor([-DISH_X, TOP.top, 0], SINK)
  const sink = r.zone([-DISH_X, TOP.top + 0.5, 0], [TOP.w, 1, 1.2], {
    name: 'sink',
    // Whoever comes into the sink splashes, before their turn too.
    enter: (who) => {
      w.sound('splash')
      w.puff(who.at(), 'drop', { color: '#9fd8ff', count: 8 })
    },
    stay: (who) => {
      const apple = apples.find((a) => a === who)
      if (apple === undefined || apple.heldBy() !== null || washed.has(apple)) return
      washed.add(apple)
      apple.glow(CLEAN, true)
      w.sound('bubbles')
      w.puff(apple.at(), 'bubble', { color: '#cfefff', count: 10 })
    },
  })

  // The pie dish on the stove, with an apple shown in it for every washed apple brought, and the count high over the seesaw. An apple not yet washed asks for the sink.
  const stoveTop = TOP.top
  r.decor([DISH_X, stoveTop, 0], DISH)
  const inDish: Decor[] = Array.from({ length: total }, (_, i) =>
    r.decor([DISH_X - 0.45 + (i % IN_ROW) * 0.3, stoveTop + 0.12 + Math.floor(i / IN_ROW) * 0.16, -0.2 + (Math.floor(i / IN_ROW) % 2) * 0.25], APPLE, { hidden: true, scale: 0.8 }),
  )
  const counter = r.sign([0, 7.1, 0], { count: 0, of: total })
  let brought = 0
  const dish = r.zone([DISH_X, stoveTop + 0.5, 0], [TOP.w, 1, 1.2], {
    name: 'dish',
    enter: (who) => {
      const apple = apples.find((a) => a === who)
      if (apple !== undefined && !washed.has(apple)) w.pop(apple.at(), { en: 'Wash me', fi: 'Pese minut' })
    },
    stay: (who) => {
      const apple = apples.find((a) => a === who)
      if (apple === undefined || apple.heldBy() !== null || apple.hidden() || !washed.has(apple)) return
      apple.hide()
      inDish[brought].show()
      brought += 1
      counter.write({ count: brought, of: total })
      w.sound('plop')
      w.puff(dish.at(), 'heart', { count: 8 })
    },
  })
  const pie = r.decor([DISH_X, stoveTop, 0], PIE, { hidden: true })

  players[0].putAt([-7.2, 0, 0])
  players[1].putAt([-6.3, 0, 0])
  r.wayOut([6.35, 0, 0])

  const on = (k: number) => () => players.some((p) => branches.some((b, i) => i % BRANCHES.length === k && p.standingOn() === b))
  r.steps([
    { hint: { en: 'Jump on the seesaw to fly a friend', fi: 'Hyppää keinulaudalle, niin kaveri lentää' }, at: seesaw, done: on(0) },
    { hint: { en: 'Jump from higher to fly higher', fi: 'Hyppää korkeammalta, niin kaveri lentää korkeammalle' }, at: tops[0], done: on(1) },
    { hint: { en: 'Wash an apple in the sink', fi: 'Pese omena tiskialtaassa' }, at: sink, done: () => washed.size > 0 },
    { hint: { en: 'Put clean apples in the pie dish', fi: 'Laita puhtaat omenat piirakkavuokaan' }, at: dish, done: () => brought === total },
  ])

  let ended = false
  return () => {
    for (const p of players) lastVy.set(p, p.velocity()[1])
    if (ended || w.stepsDone() < 4) return
    ended = true
    for (const a of inDish) a.hide()
    pie.show()
    w.puff([DISH_X, stoveTop + 0.6, 0], 'smoke', { color: '#ffffff', count: 12 })
    w.puff([DISH_X, stoveTop + 1, 0], 'heart', { count: 20 })
    w.sound('munch')
    w.after(2, () => w.finish())
  }
}

/** Where each side's seat and top are, by the side's name, for the walkthrough. */
const SEAT_OF = { left: 'stool', right: 'footstool' } as const
const TOP_OF = { left: 'stove', right: 'counter' } as const

/**
 * The walkthrough, a tree at a time: the flier stands on the tree's end of the seesaw, and the other
 * bot jumps onto the other end, first from the floor beyond that end, then from the seat, then from
 * the top, so the flier lands on each branch in turn and shakes it; after each throw the flier comes
 * down and stands on its end again. Then both carry the tree's apples to the sink and on to the pie
 * dish. Bot 1 flies into the right tree, then bot 0 into the left.
 */
export const walk: WalkCode = function* (bots, w) {
  const perTree = BRANCHES.reduce((n, b) => n + b.count[w.level() - 1], 0)
  const dish = w.get('dish')
  const sink = w.get('sink')
  const seesaw = w.get('seesaw') as MoverView
  const plank = w.get('seesaw-left')
  for (const [flier, stomper, side, other, first] of [
    [bots[1], bots[0], 'right', 'left', 1],
    [bots[0], bots[1], 'left', 'right', perTree + 1],
  ] as const) {
    const from = [null, w.get(SEAT_OF[other]), w.get(TOP_OF[other])]
    const away = other === 'left' ? -1 : 1
    for (let k = 0; k < BRANCHES.length; k++) {
      const jumpFrom = from[k]
      // A stomp is a jump onto the other end, so the stomper first stands on the floor beyond it, off the seesaw.
      if (k === 0) yield* stomper.goTo([away * FLOOR_SPOT, 0, 0])
      yield* flier.goTo([-away * FLIER_X, PLANK_TOP, 0])
      if (jumpFrom !== null) yield* stomper.goTo(jumpFrom)
      // The seesaw tips when anyone lands on it, the flier on the way too: the stomp waits until it lies level again.
      yield* w.until(() => !seesaw.moving() && Math.abs(plank.at()[1] - PIVOT[1]) < 0.01)
      // goTo plans the leap from the floor; from a seat or a top it must be a jump, not a step off, so the stick and the jump are held.
      if (jumpFrom === null) yield* stomper.goTo(w.get(`seesaw-${other}`))
      else yield* w.together(stomper.steer([-away, 0], 0.9), stomper.hold('a', 0.5))
      yield* w.until(() => flier.velocity()[1] > 5)
      // The stomper steps off, so the flier coming down onto the seesaw throws nobody.
      yield* w.together(stomper.goTo([away * FLOOR_SPOT, 0, 0]), flier.goTo(w.get(`branch-${side}-${k + 1}`)))
    }
    const apples = Array.from({ length: perTree }, (_, i) => w.get(`apple-${first + i}`) as ThingView)
    yield* w.together(
      ...[flier, stomper].map((bot, j) =>
        (function* () {
          for (let i = j; i < apples.length; i += 2) {
            yield* bot.carry(apples[i], sink)
            yield* bot.carry(apples[i], dish)
          }
        })(),
      ),
    )
  }
}
