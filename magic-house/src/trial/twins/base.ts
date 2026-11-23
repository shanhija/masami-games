/**
 * Magic House: the base of the broken twins (plan.md, The twins). The game's own room for
 * four players, Pirate Sails (own/rooms/pirate-sails.ts), written again as made code, exactly as a
 * designer writes it from the reference: the room as the body of function (r, w) and its
 * walkthrough as the body of function* (bots, w), plain text that uses only the reference's calls
 * and the guard's allowed names, no imports, every number its own. It goes through the guard
 * (server/codeKinds.ts) and the compile (trial/compile.ts) as a room from the line does, and passes
 * the whole trial at every level as its TypeScript original does. It is the one copy of a room in
 * two forms, kept on purpose: twins.test.ts holds the two to the same room as built (their surveys)
 * at every level and the same bot seconds, so a change to either turns a test red until the other
 * follows. Each twin (twins.ts) is a small edit of this text.
 */

import { facts } from '../../own/rooms/pirate-sails'
import type { TrialJob } from '../../protocol'

/** What the base's trial job carries besides its code: the original's party, seed, kind and shell, asked at level 1. */
export const BASE_JOB: Omit<TrialJob, 'room' | 'walk'> = {
  line: 'twins',
  attempt: 1,
  party: 4,
  seed: 404,
  roll: { kind: 'together', view: 'side' },
  level: 1,
  shell: facts.shell,
}

/** The room: the body of function (r, w). */
export const BASE_ROOM = `const level = w.level()
const players = w.players()
const pullSecs = [5, 5.5, 6][level - 1]

// Where the masts stand: the main mast, the fore mast and the short one on the bow.
const mainMast = -2.6
const foreMast = 3
const bowMast = 6.7

// Where a player stands to pull each rope: [x, the top of the floor there].
const ropeAt = {
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
// Each sail: its four ropes, its mast and how high it hangs open. Eight, nine or ten by level.
const sails = [
  { ropes: ['aft', 'middle', 'fore', 'stern'], mast: mainMast, y: 2.1 },
  { ropes: ['foreLow', 'mainLow', 'bow', 'mainHigh'], mast: foreMast, y: 2.1 },
  { ropes: ['mainNest', 'foreHigh', 'aft', 'fore'], mast: mainMast, y: 3.5 },
  { ropes: ['bow', 'stern', 'foreNest', 'middle'], mast: foreMast, y: 3.5 },
  { ropes: ['mainLow', 'fore', 'mainHigh', 'foreLow'], mast: mainMast, y: 4.9 },
  { ropes: ['stern', 'mainNest', 'bow', 'aft'], mast: foreMast, y: 4.9 },
  { ropes: ['foreNest', 'middle', 'mainLow', 'foreHigh'], mast: mainMast, y: 6.3 },
  { ropes: ['mainHigh', 'bow', 'fore', 'stern'], mast: foreMast, y: 6.3 },
  { ropes: ['foreLow', 'aft', 'mainNest', 'middle'], mast: bowMast, y: 3.3 },
  { ropes: ['bow', 'foreHigh', 'stern', 'mainHigh'], mast: bowMast, y: 4.7 },
].slice(0, level + 7)

const wood = '#7a4b2a'
const gold = '#ffd23a'
const pullIcon = (m) => {
  m.torus(0.25, 0.07, { at: [0, 0.55, 0], color: '#d9b26a' })
  m.cylinder(0.05, 0.05, 0.5, { at: [0, 0.3, 0], color: '#d9b26a' })
  m.cone(0.16, 0.22, { at: [0, 0.05, 0], rot: [Math.PI, 0, 0], color: '#ff5a4e' })
}
const ropeModel = (m) => {
  m.cylinder(0.04, 0.04, 1.8, { at: [0, 1.6, 0], color: '#d9b26a' })
  m.cylinder(0.1, 0.1, 0.36, { at: [0, 0.75, 0], color: '#ff5a4e', glow: true })
  m.sphere(0.12, { at: [0, 2.55, 0], color: '#6b4226' })
}
const furledModel = (m) => {
  m.cylinder(0.06, 0.06, 2.8, { at: [0, 0, 0], rot: [0, 0, Math.PI / 2], color: wood })
  m.capsule(0.12, 2.2, { at: [0, -0.16, 0.05], rot: [0, 0, Math.PI / 2], color: '#f3ead6' })
  for (const x of [-0.8, 0, 0.8]) m.torus(0.13, 0.025, { at: [x, -0.16, 0.05], rot: [0, Math.PI / 2, 0], color: '#e2474b' })
}
const sailModel = (m) => {
  m.box(2.5, 1.25, 0.06, { at: [0, 0, 0], color: '#fbf6ea' })
  m.box(2.5, 0.22, 0.07, { at: [0, 0, 0.01], color: '#e2474b' })
}
// A mast from the deck to under the ceiling, high metres, with a ball on top.
const mastModel = (high) => (m) => {
  m.cylinder(0.14, 0.18, high, { at: [0, high / 2, 0], color: wood })
  m.sphere(0.16, { at: [0, high + 0.1, 0], color: gold })
}
const flagModel = (m) => {
  m.box(1.2, 0.8, 0.04, { at: [0.6, 0, 0], color: '#e2474b' })
  m.cylinder(0.24, 0.24, 0.05, { at: [0.6, 0, 0.03], rot: [Math.PI / 2, 0, 0], color: gold })
}
const chestModel = (m) => {
  m.box(1.1, 0.6, 0.7, { at: [0, 0.3, 0], color: '#8a5a32' })
  m.box(1.14, 0.08, 0.74, { at: [0, 0.45, 0], color: gold })
  m.part('lid', { at: [0, 0.6, -0.35] }, () => {
    m.box(1.12, 0.3, 0.72, { at: [0, 0.15, 0.36], color: '#9a6334' })
    m.box(0.16, 0.18, 0.06, { at: [0, 0.05, 0.73], color: gold })
  })
}
const coinsModel = (m) => {
  for (let k = 0; k < 7; k++) m.cylinder(0.12, 0.12, 0.04, { at: [-0.3 + (k % 4) * 0.2, 0.62 + Math.floor(k / 4) * 0.05, -0.1 + (k % 3) * 0.1], color: gold, glow: true })
  m.sphere(0.12, { at: [0.25, 0.7, 0], color: '#ff5ab4', glow: true })
}

// The ship: the stern and the bow at either end of the deck, and the yards and crow's nests up both masts.
r.box([-6.7, 0.7, 0], [2.6, 1.4, 2], { name: 'stern' })
r.box([6.9, 0.5, 0], [2.2, 1, 2], { name: 'bow' })
for (const x of [mainMast, foreMast]) {
  r.decor([x, 0, -0.9], mastModel(7.4))
  r.box([x + (x < 0 ? 0.6 : 0.1), 1.275, 0], [3, 0.25, 1], { through: true, color: wood })
  r.box([x, 2.675, 0], [2, 0.25, 1], { through: true, color: wood })
  r.box([x, 4.075, 0], [1.4, 0.25, 1.2], { through: true, color: '#5e3a20' })
}
r.decor([bowMast, 1, -0.9], mastModel(4.6))

// Each rope: a place to stand and pull, its rope shown while it opens the next sail.
const pulling = new Set()
const ropeNames = Object.keys(ropeAt)
const zones = new Map()
const ropes = new Map()
for (const name of ropeNames) {
  const [x, top] = ropeAt[name]
  zones.set(name, r.zone([x, top + 0.7, 0], [1, 1.4, 2], { name: 'rope-' + name }))
  ropes.set(name, r.decor([x, top, 0.3], ropeModel, { hidden: true }))
}

// Each sail rolled on its yard until its ropes pull it open; tapped before then, it flaps.
const furled = sails.map((s) =>
  r.decor([s.mast, s.y + 0.7, -0.5], furledModel, {
    tap: () => {
      w.sound('cloth')
      w.puff([s.mast, s.y + 0.6, 0], 'dust', { count: 6 })
    },
  }),
)
const open = sails.map((s) => r.decor([s.mast, s.y + 0.7, -0.6], sailModel, { hidden: true }))
const pulled = r.sign([0.2, 5.4, 0], { count: 0, of: 4 })
const opened = r.sign([0.2, 6.4, 0], { count: 0, of: sails.length }, { name: 'sails' })

// The flag waits unseen by the main crow's nest; the chest answers a knock before it opens.
const flag = r.decor([mainMast + 0.15, 4.6, -0.9], flagModel, { hidden: true })
const chest = r.decor([0.4, 0, -0.6], chestModel, {
  tap: () => {
    w.sound('knock')
    w.puff([0.4, 0.9, 0], 'spark', { color: gold, count: 6 })
  },
})
const coins = r.decor([0.4, 0, -0.6], coinsModel, { hidden: true })

r.controls(players, {
  b: {
    word: { en: 'Pull', fi: 'Vedä' },
    icon: pullIcon,
    press: (p) => {
      w.sound('squeak')
      w.puff([p.at()[0], p.at()[1] + 1.2, 0], 'dust', { count: 4 })
    },
    hold: (p) => {
      pulling.add(p)
    },
  },
})

const starts = [-3.4, -2.2, 1.6, 2.8]
players.forEach((p, i) => p.putAt([starts[i], 0, 0]))
r.wayOut([-7.3, 1.4, 0])

let sail = 0
let progress = 0
let everPulled = false
const showRopes = () => {
  for (const name of ropeNames) {
    const rope = ropes.get(name)
    if (sail < sails.length && sails[sail].ropes.includes(name)) {
      rope.show()
      rope.glow(gold, true)
    } else rope.hide()
  }
}
showRopes()

r.steps([
  { hint: { en: 'Find a glowing rope and pull', fi: 'Etsi hehkuva köysi ja vedä' }, at: zones.get('middle'), done: () => everPulled },
  { hint: { en: 'Everyone pull at the same time', fi: 'Vetäkää kaikki yhtä aikaa' }, at: open[0], done: () => sail >= 1 },
  { hint: { en: 'More ropes glow for the next sail', fi: 'Uudet köydet hehkuvat seuraavaan purjeeseen' }, at: open[sails.length - 1], done: () => sail === sails.length },
])

let ended = false
return (dt) => {
  if (sail < sails.length) {
    const count = sails[sail].ropes.filter((name) => {
      const zone = zones.get(name)
      const held = players.some((p) => pulling.has(p) && zone.has(p))
      ropes.get(name).glow(held ? '#7dff9a' : gold, !held)
      return held
    }).length
    if (count > 0) everPulled = true
    pulled.write({ count: count, of: 4 })
    if (count === 4) {
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
  flag.show()
  flag.slideTo([mainMast + 0.15, 7, -0.9], 3)
  w.sound('bell')
  w.after(3, () => {
    chest.pose('lid', [-1.6, 0, 0], 0.4)
    coins.show()
    w.puff([0.4, 1, 0], 'confetti', { count: 30 })
    w.puff([0.4, 0.8, 0], 'spark', { color: gold, count: 20 })
    w.sound('yay')
  })
  w.after(5, () => w.finish())
}`

/** The walkthrough: the body of function* (bots, w). For each sail, bot i goes to its i-th rope and pulls until the sail is open. */
export const BASE_WALK = `const sails = [
  ['aft', 'middle', 'fore', 'stern'],
  ['foreLow', 'mainLow', 'bow', 'mainHigh'],
  ['mainNest', 'foreHigh', 'aft', 'fore'],
  ['bow', 'stern', 'foreNest', 'middle'],
  ['mainLow', 'fore', 'mainHigh', 'foreLow'],
  ['stern', 'mainNest', 'bow', 'aft'],
  ['foreNest', 'middle', 'mainLow', 'foreHigh'],
  ['mainHigh', 'bow', 'fore', 'stern'],
  ['foreLow', 'aft', 'mainNest', 'middle'],
  ['bow', 'foreHigh', 'stern', 'mainHigh'],
]
const opened = () => w.get('sails').what().count
for (let k = 0; k < w.level() + 7; k++) {
  const ropes = sails[k]
  yield* w.together(
    ...bots.map((bot, i) =>
      (function* () {
        yield* bot.goTo(w.get('rope-' + ropes[i]))
        while (opened() === k) yield* bot.hold('b', 0.5)
      })(),
    ),
  )
}
yield* w.until(() => w.stepsDone() === 3)`
