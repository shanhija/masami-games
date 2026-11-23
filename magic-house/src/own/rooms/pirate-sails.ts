/**
 * Magic House's own room for four players: Pirate Sails. A pirate ship inside a room of the house:
 * its deck is the room's floor, its two masts reach up to the ceiling, and every sail is rolled up.
 * Four ropes glow at a time, scattered round the ship: on the deck, on the stern and the bow, up the
 * masts and in the crow's nests. Each player has a button to pull. A sail drops open only while all
 * four glowing ropes are pulled at once, so every player must find a rope and pull with the others;
 * dots over the deck show how many ropes are pulled now. When a sail is open, four other ropes glow
 * somewhere else for the next sail, mostly at the other end of the ship or another height, so the
 * players cross the room and climb between sails. With every sail open the flag goes up the main
 * mast, the ship's bell rings and the treasure chest on the deck bursts open. Level adds sails (8, 9,
 * 10) and makes each take longer to pull open: more to do, never more to wait for.
 *
 * Laid inside the house's box (engine/api.ts ROOM: x -8 to 8, y 0 to 8): the deck is the house's
 * floor, the stern and the bow are ledges a jump high at either end, and the yards and crow's nests
 * up both masts are floors to jump up through, each a jump above the one below, so wherever a player
 * gets to, a drop leads back down to the deck. The way out stands on the stern. The stern and the bow
 * are plain solids with no colour of their own, which the look (pirate-sails.look.ts) dresses as the
 * ship's quarterdeck and forecastle; what the play colours (the yards, ropes, sails, flag and chest)
 * is what the players play with. The ship's furniture, lanterns and lights are the look's.
 *
 * Written by hand against the builder (engine/api.ts), as a designer's room would be; never shown
 * to the model (plan.md, How Opus is asked). The twins' base (trial/twins/base.ts) is this room
 * written again as made code, so it stays plain: tables of numbers, one loop for each kind of thing.
 */

import type { Count, Decor, Level, Player, RoomCode, SignView, Zone } from '../../engine/api'
import type { Model } from '../../engine/gift'
import type { WalkCode } from '../../trial/api'
import type { OwnFacts } from './facts'

export const facts: OwnFacts = {
  id: 'own:pirate-sails',
  party: 4,
  seed: 404,
  kind: 'together',
  view: 'side',
  theme: 'a pirate ship in a room of the house, its sails rolled up',
  task: 'find the four glowing ropes round the ship and all pull at once to open each sail, until the flag goes up and the treasure chest bursts open',
  name: { en: 'Pirate Sails', fi: 'Merirosvon purjeet' },
  shell: {
    walls: { color: '#2f6286', second: '#3a7099', pattern: 'stripes' },
    floor: { color: '#d39b5e', second: '#c48b50', pattern: 'stripes' },
    ceiling: { color: '#5a3b25', second: '#6a4a30', pattern: 'stripes' },
    trim: '#e8b84a',
    light: 0.9,
  },
}

/** Where the masts stand: the main mast, the fore mast and the short one on the bow. */
const MAIN = -2.6
const FORE = 3
const BOW_MAST = 6.7

/** The rope places on the ship: where a player stands to pull, [x, the top of the floor there]. */
export const ROPES: Readonly<Record<string, readonly [number, number]>> = {
  stern: [-6, 1.4],
  aft: [-4.6, 0],
  mainLow: [-1.2, 1.4],
  mainHigh: [-3.1, 2.8],
  mainNest: [-2.3, 4.2],
  middle: [0.4, 0],
  foreHigh: [2.5, 2.8],
  foreNest: [3.3, 4.2],
  foreLow: [4, 1.4],
  fore: [5.1, 0],
  bow: [7.2, 1],
}
type RopeName = keyof typeof ROPES

/** Each sail: the four ropes that open it (bot i walks to the i-th), which mast it hangs on and how high its middle is when open. The first eight, nine or ten by level; the last two hang over the bow. No rope opens two sails in a row, so every player moves on between sails, most across the ship or up or down a mast. */
export const SAILS: readonly { ropes: readonly RopeName[]; mast: number; y: number }[] = [
  { ropes: ['aft', 'middle', 'fore', 'stern'], mast: MAIN, y: 2.1 },
  { ropes: ['foreLow', 'mainLow', 'bow', 'mainHigh'], mast: FORE, y: 2.1 },
  { ropes: ['mainNest', 'foreHigh', 'aft', 'fore'], mast: MAIN, y: 3.5 },
  { ropes: ['bow', 'stern', 'foreNest', 'middle'], mast: FORE, y: 3.5 },
  { ropes: ['mainLow', 'fore', 'mainHigh', 'foreLow'], mast: MAIN, y: 4.9 },
  { ropes: ['stern', 'mainNest', 'bow', 'aft'], mast: FORE, y: 4.9 },
  { ropes: ['foreNest', 'middle', 'mainLow', 'foreHigh'], mast: MAIN, y: 6.3 },
  { ropes: ['mainHigh', 'bow', 'fore', 'stern'], mast: FORE, y: 6.3 },
  { ropes: ['foreLow', 'aft', 'mainNest', 'middle'], mast: BOW_MAST, y: 3.3 },
  { ropes: ['bow', 'foreHigh', 'stern', 'mainHigh'], mast: BOW_MAST, y: 4.7 },
]

/** How many sails a level opens: eight, nine or ten. */
export const sailCount = (level: Level) => level + 7

const WOOD = '#7a4b2a'
const GOLD = '#ffd23a'

/** The pull button's picture: a coil of rope and a hand's arrow pulling it down. */
const PULL_ICON: Model = (m) => {
  m.torus(0.25, 0.07, { at: [0, 0.55, 0], color: '#d9b26a' })
  m.cylinder(0.05, 0.05, 0.5, { at: [0, 0.3, 0], color: '#d9b26a' })
  m.cone(0.16, 0.22, { at: [0, 0.05, 0], rot: [Math.PI, 0, 0], color: '#ff5a4e' })
}

/** A rope hanging down to a handle at the height of a child's hands, from a pulley above. */
const ROPE: Model = (m) => {
  m.cylinder(0.04, 0.04, 1.8, { at: [0, 1.6, 0], color: '#d9b26a' })
  m.cylinder(0.1, 0.1, 0.36, { at: [0, 0.75, 0], color: '#ff5a4e', glow: true })
  m.sphere(0.12, { at: [0, 2.55, 0], color: '#6b4226' })
}

/** A rolled sail tied under its yard, and the open sail that drops from it: white with a red band. */
const FURLED: Model = (m) => {
  m.cylinder(0.06, 0.06, 2.8, { at: [0, 0, 0], rot: [0, 0, Math.PI / 2], color: WOOD })
  m.capsule(0.12, 2.2, { at: [0, -0.16, 0.05], rot: [0, 0, Math.PI / 2], color: '#f3ead6' })
  for (const x of [-0.8, 0, 0.8]) m.torus(0.13, 0.025, { at: [x, -0.16, 0.05], rot: [0, Math.PI / 2, 0], color: '#e2474b' })
}
const SAIL: Model = (m) => {
  m.box(2.5, 1.25, 0.06, { at: [0, 0, 0], color: '#fbf6ea' })
  m.box(2.5, 0.22, 0.07, { at: [0, 0, 0.01], color: '#e2474b' })
}

/** A mast from the deck to under the ceiling, `high` metres, with a ball on top. */
function mast(high: number): Model {
  return (m) => {
    m.cylinder(0.14, 0.18, high, { at: [0, high / 2, 0], color: WOOD })
    m.sphere(0.16, { at: [0, high + 0.1, 0], color: GOLD })
  }
}

/** The ship's flag: a red flag with a gold coin on it, and its pole's top. */
const FLAG: Model = (m) => {
  m.box(1.2, 0.8, 0.04, { at: [0.6, 0, 0], color: '#e2474b' })
  m.cylinder(0.24, 0.24, 0.05, { at: [0.6, 0, 0.03], rot: [Math.PI / 2, 0, 0], color: GOLD })
}

const CHEST: Model = (m) => {
  m.box(1.1, 0.6, 0.7, { at: [0, 0.3, 0], color: '#8a5a32' })
  m.box(1.14, 0.08, 0.74, { at: [0, 0.45, 0], color: GOLD })
  m.part('lid', { at: [0, 0.6, -0.35] }, () => {
    m.box(1.12, 0.3, 0.72, { at: [0, 0.15, 0.36], color: '#9a6334' })
    m.box(0.16, 0.18, 0.06, { at: [0, 0.05, 0.73], color: GOLD })
  })
}
const COINS: Model = (m) => {
  for (let k = 0; k < 7; k++) m.cylinder(0.12, 0.12, 0.04, { at: [-0.3 + (k % 4) * 0.2, 0.62 + Math.floor(k / 4) * 0.05, -0.1 + (k % 3) * 0.1], color: GOLD, glow: true })
  m.sphere(0.12, { at: [0.25, 0.7, 0], color: '#ff5ab4', glow: true })
}

export const room: RoomCode = (r, w) => {
  const level = w.level()
  const sails = SAILS.slice(0, sailCount(level))
  const pullSecs = [5, 5.5, 6][level - 1]
  const players = w.players()

  // The ship: the stern and the bow at either end of the deck (left plain for the look), and the yards and crow's nests up both masts (floors to jump up through).
  r.box([-6.7, 0.7, 0], [2.6, 1.4, 2], { name: 'stern' })
  r.box([6.9, 0.5, 0], [2.2, 1, 2], { name: 'bow' })
  for (const x of [MAIN, FORE]) {
    r.decor([x, 0, -0.9], mast(7.4))
    r.box([x + (x < 0 ? 0.6 : 0.1), 1.275, 0], [3, 0.25, 1], { through: true, color: WOOD })
    r.box([x, 2.675, 0], [2, 0.25, 1], { through: true, color: WOOD })
    r.box([x, 4.075, 0], [1.4, 0.25, 1.2], { through: true, color: '#5e3a20' })
  }
  r.decor([BOW_MAST, 1, -0.9], mast(4.6))

  // The ropes: each a place to stand and pull, its rope shown while it opens the sail being opened.
  const pulling = new Set<Player>()
  const ropeNames = Object.keys(ROPES) as RopeName[]
  const zones = new Map<RopeName, Zone>()
  const ropes = new Map<RopeName, Decor>()
  for (const name of ropeNames) {
    const [x, top] = ROPES[name]
    zones.set(name, r.zone([x, top + 0.7, 0], [1, 1.4, 2], { name: `rope-${name}` }))
    ropes.set(name, r.decor([x, top, 0.3], ROPE, { hidden: true }))
  }

  // The sails: each rolled on its yard until its ropes pull it open. Tapped before then, a rolled sail flaps.
  const furled: Decor[] = sails.map((s) =>
    r.decor([s.mast, s.y + 0.7, -0.5], FURLED, {
      tap: () => {
        w.sound('cloth')
        w.puff([s.mast, s.y + 0.6, 0], 'dust', { count: 6 })
      },
    }),
  )
  const open: Decor[] = sails.map((s) => r.decor([s.mast, s.y + 0.7, -0.6], SAIL, { hidden: true }))
  // The counts over the deck between the masts, where the players look: ropes pulled now, sails open.
  const pulled = r.sign([0.2, 5.4, 0], { count: 0, of: 4 })
  const opened = r.sign([0.2, 6.4, 0], { count: 0, of: sails.length }, { name: 'sails' })

  // The flag waits, unseen, by the main mast's crow's nest; the chest stands on the deck between the masts, and answers a knock before it opens.
  const flag = r.decor([MAIN + 0.15, 4.6, -0.9], FLAG, { hidden: true })
  const chest = r.decor([0.4, 0, -0.6], CHEST, {
    tap: () => {
      w.sound('knock')
      w.puff([0.4, 0.9, 0], 'spark', { color: GOLD, count: 6 })
    },
  })
  const coins = r.decor([0.4, 0, -0.6], COINS, { hidden: true })

  r.controls(players, {
    b: {
      word: { en: 'Pull', fi: 'Vedä' },
      icon: PULL_ICON,
      press: (p) => {
        w.sound('squeak')
        w.puff([p.at()[0], p.at()[1] + 1.2, 0], 'dust', { count: 4 })
      },
      hold: (p) => {
        pulling.add(p)
      },
    },
  })

  // The starts on the deck, each clear of every rope's place, so no rope is pulled before anyone walks to it.
  const starts = [-3.4, -2.2, 1.6, 2.8]
  players.forEach((p, i) => p.putAt([starts[i], 0, 0]))
  r.wayOut([-7.3, 1.4, 0])

  let sail = 0
  let progress = 0
  let everPulled = false
  const showRopes = () => {
    for (const name of ropeNames) {
      const rope = ropes.get(name) as Decor
      if (sail < sails.length && sails[sail].ropes.includes(name)) {
        rope.show()
        rope.glow(GOLD, true)
      } else rope.hide()
    }
  }
  showRopes()

  r.steps([
    { hint: { en: 'Find a glowing rope and pull', fi: 'Etsi hehkuva köysi ja vedä' }, at: zones.get('middle') as Zone, done: () => everPulled },
    { hint: { en: 'Everyone pull at the same time', fi: 'Vetäkää kaikki yhtä aikaa' }, at: open[0], done: () => sail >= 1 },
    { hint: { en: 'More ropes glow for the next sail', fi: 'Uudet köydet hehkuvat seuraavaan purjeeseen' }, at: open[sails.length - 1], done: () => sail === sails.length },
  ])

  let ended = false
  return (dt) => {
    if (sail < sails.length) {
      // Each glowing rope with a player in its place pulling it.
      const count = sails[sail].ropes.filter((name) => {
        const zone = zones.get(name) as Zone
        const held = players.some((p) => pulling.has(p) && zone.has(p))
        ;(ropes.get(name) as Decor).glow(held ? '#7dff9a' : GOLD, !held)
        return held
      }).length
      if (count > 0) everPulled = true
      pulled.write({ count, of: 4 })
      if (count === 4) {
        // All four together: the sail drops open a little more.
        progress = Math.min(1, progress + dt / pullSecs)
        const s = sails[sail]
        if (open[sail].hidden()) {
          open[sail].show()
          w.sound('whoosh')
        }
        open[sail].putAt([s.mast, s.y + 0.6 * (1 - progress), -0.6])
        if (progress >= 1) {
          furled[sail].hide()
          w.puff([s.mast, s.y, 0], 'star', { count: 20 })
          w.sound('ding')
          sail += 1
          progress = 0
          opened.write({ count: sail, of: sails.length })
          showRopes()
        }
      }
    }
    pulling.clear()
    if (ended || w.stepsDone() < 3) return
    ended = true
    // Every sail open: the flag goes up the main mast, the bell rings, and the chest bursts open with gold.
    flag.show()
    flag.slideTo([MAIN + 0.15, 7, -0.9], 3)
    w.sound('bell')
    w.after(3, () => {
      chest.pose('lid', [-1.6, 0, 0], 0.4)
      coins.show()
      w.puff([0.4, 1, 0], 'confetti', { count: 30 })
      w.puff([0.4, 0.8, 0], 'spark', { color: GOLD, count: 20 })
      w.sound('yay')
    })
    w.after(5, () => w.finish())
  }
}

/**
 * The walkthrough: for each sail, each bot goes to one of its four glowing ropes (bot i to the i-th)
 * and holds the pull button there until the sail is open; the walkthrough reads which sail is next
 * from the 'sails' sign.
 */
export const walk: WalkCode = function* (bots, w) {
  const n = w.level() + 7
  const opened = () => ((w.get('sails') as SignView).what() as Count).count
  for (let k = 0; k < n; k++) {
    const ropes = SAILS[k].ropes
    yield* w.together(
      ...bots.map((b, i) =>
        (function* () {
          yield* b.goTo(w.get(`rope-${ropes[i]}`))
          while (opened() === k) yield* b.hold('b', 0.5)
        })(),
      ),
    )
  }
  yield* w.until(() => w.stepsDone() === 3)
}
