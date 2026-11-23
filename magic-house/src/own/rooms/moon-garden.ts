/**
 * Magic House's own room for one player: Moon Garden. A glasshouse at night, its glass full of
 * stars, where a sleeping moon rests on a cloud under the roof. Glowing seeds lie on the potting
 * bench, on a shelf hung over the pond, on the crate and the shelf by the right wall (and, at level
 * 3, in the pond itself). A seed set down by a flower pot is planted, and its bud comes up. The
 * watering can is filled by setting it down in the pond (a low basin on the floor at the foot of the
 * shelves); set down by a planted pot it waters it, and the flower grows by GROWTH, until its head,
 * a floor to jump up through and stand on, is as high as its place in the row: each pot's flower
 * one step higher than the one before, so the flowers become a stair up to the moon's cloud. Last,
 * the moon's own seed, waiting on the cupboard, is carried up the stair and set down in the moon's
 * pot: it blooms and the moon wakes. One thing is carried at a time, so every flower is a seed
 * fetched and a trip to the pond and back for each watering. Level 1 has four pots, level 2 five and
 * level 3 six, under the same cloud: more flowers, more seeds and more watering at each level (14,
 * 15 and 21 waterings), never more to wait for, and the bots' clean pass takes 75 s, 82 s and 97 s.
 *
 * Laid inside the house's box (engine/api.ts ROOM: x -8 to 8, y 0 to 8): the floor is the house's,
 * so wherever the player can get down to (the floor, the pond, any shelf), the potting shelves or
 * the crate lead back up; the shelf over the crate stands high enough to stand under. The way out
 * stands on that shelf. The shelves, the crate and the pond's rims are plain solids with no colour
 * of their own, which the look (moon-garden.look.ts) dresses as furniture; what the play colours
 * (the pots, seeds, can, flowers, cloud and moon) is what the player plays with. Its stars, lamps
 * and furniture are the look's; the moon's light is the play's, turned up when the moon wakes.
 *
 * Written by hand against the builder (engine/api.ts), as a designer's room would be; never shown
 * to the model (plan.md, How Opus is asked).
 */

import type { MoverView, Point, RoomCode, Thing, ThingView, Zone } from '../../engine/api'
import type { Model } from '../../engine/gift'
import { cos, sin } from '../../engine/math'
import type { WalkCode } from '../../trial/api'
import type { OwnFacts } from './facts'

export const facts: OwnFacts = {
  id: 'own:moon-garden',
  party: 1,
  seed: 101,
  kind: 'together',
  view: 'side',
  theme: 'a glasshouse garden at night under a sleeping moon',
  task: "plant glowing seeds in the pots and water them from the pond until the flowers grow into a stair, then carry the moon's own seed up it to wake the moon",
  name: { en: 'Moon Garden', fi: 'Kuutarha' },
  shell: {
    walls: { color: '#1f2c66', second: '#3a4c96', pattern: 'stars' },
    floor: { color: '#4a6f5a', second: '#557d66', pattern: 'checks' },
    ceiling: { color: '#18234f', second: '#2e3d7c', pattern: 'stars' },
    trim: '#e8e4ff',
    light: 0.6,
  },
}

/** How many seeds and pots at each level. */
export const SEEDS = [4, 5, 6]
/** Where the pots stand, right to left from the last: one every POT_GAP metres from LAST_POT, so the last flower is always a jump from the moon's cloud. */
const LAST_POT = 4.4
const POT_GAP = 1.5
/** The moon's cloud: its top, and its left and right ends (it reaches the right wall). Each flower's head rises to its share of the cloud's height, so n flowers make n + 1 even steps from the floor. */
const CLOUD_TOP = 5.75
const CLOUD_LEFT = 5.3
const CLOUD_RIGHT = 8
/** A bud's top in its pot before it grows. */
const BUD_TOP = 0.5
/** How much a flower grows each time it is watered, metres, up to its place in the stair: the same at every level, so the taller stairs of the lower levels take more watering for each flower. */
const GROWTH = CLOUD_TOP / 6
/** The pots stand just behind the plane of the play, so a child walking past them is drawn in front of them. */
const POT_Z = -0.5
/** Where the player starts: between two pots on every level, clear of all of them. */
const START: Point = [0.65, 0, 0]

/** The flower heads' colours, one a pot. */
const PETALS = ['#ff7eb6', '#b57bff', '#ff9f43', '#5ec8ff', '#ffe14d', '#7dffb0']
const CLOUD_WHITE = '#e4ebff'
const WATER = '#2f7be6'
const FULL = '#9fdcff'

const SEED: Model = (m) => {
  m.sphere(0.2, { at: [0, 0.24, 0], scale: [1, 1.2, 1], color: '#ffe066', glow: true })
  m.cone(0.08, 0.18, { at: [0, 0.56, 0], color: '#8ee07a' })
}

const POT: Model = (m) => {
  m.cylinder(0.45, 0.34, 0.5, { at: [0, 0.25, 0], color: '#d9734a' })
  m.cylinder(0.5, 0.5, 0.12, { at: [0, 0.54, 0], color: '#e88a5c' })
  m.cylinder(0.42, 0.42, 0.04, { at: [0, 0.6, 0], color: '#5a3a22' })
}

/** The watering can: a round body with a long spout to the right and a handle over it. */
const CAN: Model = (m) => {
  m.cylinder(0.22, 0.24, 0.4, { at: [0, 0.2, 0], color: '#4fa3d9' })
  m.cylinder(0.23, 0.23, 0.05, { at: [0, 0.41, 0], color: '#3a86bd' })
  m.cylinder(0.035, 0.05, 0.34, { at: [0.3, 0.32, 0], rot: [0, 0, -0.9], color: '#4fa3d9' })
  m.cylinder(0.08, 0.045, 0.07, { at: [0.44, 0.44, 0], rot: [0, 0, -0.9], color: '#3a86bd' })
  m.torus(0.15, 0.035, { at: [-0.04, 0.47, 0], color: '#3a86bd' })
}

/** A flower's head, which is its step: a leafy cup with petals round a glowing middle, wide and shallow, so a child under it or beside it on the plane of the play is drawn in front of it. */
function flowerHead(petal: string): Model {
  return (m) => {
    m.cylinder(0.65, 0.45, 0.22, { at: [0, 0.11, -0.05], scale: [1, 1, 0.25], color: '#6cc04a' })
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2
      m.sphere(0.26, { at: [cos(a) * 0.5, 0.2, -0.05 + sin(a) * 0.1], scale: [1, 0.4, 0.35], color: petal })
    }
    m.sphere(0.22, { at: [0, 0.24, -0.05], scale: [1, 0.5, 0.4], color: '#ffd23a', glow: true })
  }
}

/** A flower's stem, hanging down from under its head as far as it will ever grow, with two leaves. */
function stem(length: number): Model {
  return (m) => {
    m.cylinder(0.07, 0.09, length, { at: [0, -length / 2, 0], color: '#3f9a3a' })
    m.sphere(0.2, { at: [0.2, -0.45, 0], scale: [1.4, 0.4, 0.6], color: '#56b84a' })
    m.sphere(0.2, { at: [-0.2, -0.85, 0], scale: [1.4, 0.4, 0.6], color: '#56b84a' })
  }
}

/** A cloud to stand on, w metres wide and 0.4 thick, drawn as puffs over its box. */
function cloud(w: number): Model {
  return (m) => {
    const n = Math.max(2, Math.round(w / 0.7))
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + 0.35 + ((w - 0.7) * i) / (n - 1)
      m.sphere(0.36, { at: [x, 0.24, 0], scale: [1, 0.7, 1], color: '#eef2ff' })
    }
    m.box(w, 0.2, 0.8, { at: [0, 0.12, 0], color: CLOUD_WHITE })
  }
}

/** The moon, small enough to rest on its cloud under the roof, with its cheeks. */
const MOON: Model = (m) => {
  m.sphere(0.8, { at: [0, 0.8, 0], color: '#fff3b0', glow: true })
  m.sphere(0.14, { at: [-0.36, 0.95, 0.66], color: '#f5d77a' })
  m.sphere(0.1, { at: [0.33, 0.5, 0.71], color: '#f5d77a' })
  m.sphere(0.12, { at: [-0.4, 0.6, 0.62], scale: [1, 0.6, 0.5], color: '#ffb3a7' })
  m.sphere(0.12, { at: [0.4, 0.6, 0.62], scale: [1, 0.6, 0.5], color: '#ffb3a7' })
}

const MOON_ASLEEP: Model = (m) => {
  m.box(0.22, 0.05, 0.04, { at: [-0.25, 0.9, 0.78], color: '#6b5a2a' })
  m.box(0.22, 0.05, 0.04, { at: [0.25, 0.9, 0.78], color: '#6b5a2a' })
}

const MOON_AWAKE: Model = (m) => {
  m.sphere(0.09, { at: [-0.25, 0.9, 0.75], color: '#3a2a1a' })
  m.sphere(0.09, { at: [0.25, 0.9, 0.75], color: '#3a2a1a' })
  m.torus(0.16, 0.03, { at: [0, 0.65, 0.76], rot: [0, 0, Math.PI], scale: [1, 0.6, 1], color: '#8a4a2a' })
}

/** How many more waterings the flower of pot i (from 0) of n needs once its head is `height` high: 0 when it is as high as its place in the stair. The walkthrough counts by it too. */
export function waterings(n: number, i: number, height: number): number {
  return Math.max(0, Math.ceil(((i + 1) * CLOUD_TOP) / (n + 1) / GROWTH - height / GROWTH - 1e-9))
}

/** The moon's own seed: bigger than the others, silver, with a little crescent on top. */
const MOON_SEED: Model = (m) => {
  m.sphere(0.28, { at: [0, 0.32, 0], scale: [1, 1.15, 1], color: '#9fc2ff', glow: true })
  m.extrude([[-0.1, 0.18], [0.06, 0.24], [0.12, 0.34], [0.06, 0.44], [-0.1, 0.5], [0, 0.34]], 0.06, { at: [0, 0, 0.26], color: '#ffe680', glow: true })
  m.cone(0.08, 0.18, { at: [0, 0.72, 0], color: '#8ee07a' })
}

/** The flower the moon's seed grows into: a tall stem with a wide white bloom that shines. */
const MOON_FLOWER: Model = (m) => {
  m.cylinder(0.06, 0.08, 0.8, { at: [0, 0.4, 0], color: '#3f9a3a' })
  m.sphere(0.2, { at: [0.22, 0.35, 0], scale: [1.4, 0.4, 0.6], color: '#56b84a' })
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    m.sphere(0.24, { at: [cos(a) * 0.36, 0.9 + sin(a) * 0.36, 0.05], scale: [1, 1, 0.4], color: '#f4f6ff', glow: true })
  }
  m.sphere(0.2, { at: [0, 0.9, 0.12], scale: [1, 1, 0.6], color: '#ffe680', glow: true })
}

export const room: RoomCode = (r, w) => {
  const level = w.level()
  const n = SEEDS[level - 1]
  const growSecs = 1.2
  const potXs = Array.from({ length: n }, (_, i) => LAST_POT - (n - 1 - i) * POT_GAP)
  const stepUp = CLOUD_TOP / (n + 1)

  // The potting shelves up the left wall: a bench, a cupboard on it and a shelf hung over the pond. Plain, for the look to dress.
  r.box([-6.95, 0.6, 0], [2.1, 1.2, 1.6], { name: 'bench' })
  r.box([-7.3, 1.8, 0], [1.4, 1.2, 1.4], { name: 'cupboard' })
  r.box([-4.6, 3.45, 0], [2, 0.3, 1.2], { name: 'pond shelf' })
  // By the right wall: a crate reaching the wall, and a thin shelf over its right end, high enough to stand under on the crate.
  r.box([7, 0.5, 0], [2, 1, 1.4], { name: 'crate' })
  r.box([7.5, 2.3, 0], [1, 0.2, 1.2], { name: 'wall shelf' })

  // The seeds, glowing where the player will find them, as many as the pots, and the watering can on the floor by the crate.
  const seedSpots: Point[] = [
    [-6.25, 1.2, 0],
    [7.6, 1, 0],
    [7.8, 2.4, 0],
    [-4.75, 3.6, 0],
    [-3.85, 3.6, 0],
    [-5.2, 0, 0],
  ]
  const seeds: Thing[] = seedSpots.slice(0, n).map((at, i) => r.thing(at, SEED, { weight: 0.2, name: `seed-${i + 1}` }))
  // A golden glow of their own, which none of the look's small lights shines in.
  for (const seed of seeds) seed.glow('#ffb02e', true)
  const can = r.thing([5.1, 0, 0], CAN, { weight: 0.3, name: 'can' })

  // The pond: a low basin on the floor, its rims low enough to walk over, its water slow to wade. The can set down in it is filled.
  r.box([-5.75, 0.125, 0], [0.3, 0.25, 1.6], { name: 'left rim' })
  r.box([-3.85, 0.125, 0], [0.3, 0.25, 1.6], { name: 'right rim' })
  let full = false
  const pond = r.zone([-4.8, 0.25, 0], [1.6, 0.5, 1.4], {
    color: WATER,
    drag: 0.4,
    name: 'pond',
    enter: (who) => {
      w.sound('splash')
      w.puff(who.at(), 'drop', { color: '#8fc8ff', count: 10 })
    },
    stay: (who) => {
      if (full || who !== can || can.heldBy() !== null) return
      full = true
      can.glow(FULL, true)
      w.sound('bubbles')
      w.puff(can.at(), 'bubble', { color: FULL, count: 12 })
    },
  })

  // The pots, each with a bud in it. A seed set down by a pot plants it; then each time the full can is set down by it, its flower grows by GROWTH, until its head is as high as its place in the stair: the first one step, the last n.
  const planted: boolean[] = potXs.map(() => false)
  const heights: number[] = potXs.map(() => 0)
  const grown = (i: number) => heights[i] === (i + 1) * stepUp
  const grownCount = () => heights.filter((_, i) => grown(i)).length
  const counter = r.sign([-1.6, 7.1, 0], { count: 0, of: n })
  const pots: Zone[] = potXs.map((x, i) => {
    r.decor([x, 0, POT_Z], POT)
    const flower = r.mover(
      () => {
        r.box([0, 0, 0], [1.3, 0.24, 1.2], {
          through: true,
          color: PETALS[i],
          model: flowerHead(PETALS[i]),
          // A grown flower rings as it is landed on, so the stair plays a tune going up.
          land: (who) => {
            if (grown(i) && who.kind() === 'player') w.sound('ding')
          },
        })
        r.decor([0, -0.12, POT_Z], stem((i + 1) * stepUp - BUD_TOP + 0.6))
      },
      () => ({ at: [x, BUD_TOP - 0.12, 0] }),
      // A pot is empty until a seed is planted in it: then its bud comes up.
      { name: `flower-${i + 1}`, hidden: true },
    )
    const pot = r.zone([x, 0.6, 0], [1.2, 1.2, 1.4], {
      name: `pot-${i + 1}`,
      // Whoever comes by a pot rustles its leaves, before its turn too.
      enter: (who) => {
        if (who.kind() === 'player') w.puff([x, 0.7, 0.3], 'leaf', { count: 4 })
      },
      stay: (who) => {
        const seed = seeds.find((s) => s === who)
        if (seed !== undefined && seed.heldBy() === null && !planted[i]) {
          planted[i] = true
          seed.hide()
          flower.show()
          flower.glow('#fff2a8', true)
          w.sound('pop')
          w.puff([x, 0.7, 0.3], 'leaf', { count: 12 })
          return
        }
        if (who !== can || can.heldBy() !== null || !full || !planted[i] || grown(i)) return
        full = false
        heights[i] = waterings(n, i, heights[i] + GROWTH) === 0 ? (i + 1) * stepUp : heights[i] + GROWTH
        can.glow(null)
        flower.slideBy([0, heights[i] - BUD_TOP, 0], growSecs)
        w.sound('magic')
        w.puff([x, 0.9, 0.3], 'drop', { color: FULL, count: 16 })
        if (!grown(i)) return
        w.after(growSecs, () => flower.glow(null))
        counter.write({ count: grownCount(), of: n })
      },
    })
    return pot
  })

  // The moon's cloud under the roof, the moon asleep on it, and its own pot in front of it.
  const cloudW = CLOUD_RIGHT - CLOUD_LEFT
  r.box([(CLOUD_LEFT + CLOUD_RIGHT) / 2, CLOUD_TOP - 0.2, 0], [cloudW, 0.4, 1.6], { color: CLOUD_WHITE, model: cloud(cloudW), name: 'moon-cloud' })
  const moonAt: Point = [CLOUD_RIGHT - 0.85, CLOUD_TOP, -1]
  const moonPotX = CLOUD_LEFT + 0.55
  let woke = false
  const snore = r.sign([moonAt[0] - 0.9, CLOUD_TOP + 1.8, 0], { en: 'Zzz', fi: 'Zzz' })
  // Tapped, the moon snores in its sleep, and giggles once it is awake.
  const tapMoon = () => {
    if (woke) {
      w.sound('giggle')
      w.puff([moonAt[0], CLOUD_TOP + 0.8, 0], 'star', { color: '#fff3b0', count: 8 })
    } else {
      w.sound('snore')
      w.pop([moonAt[0], CLOUD_TOP + 1.8, 0], { en: 'Zzz', fi: 'Zzz' })
    }
  }
  r.decor(moonAt, MOON, { tap: tapMoon })
  const asleep = r.decor(moonAt, MOON_ASLEEP)
  const awake = r.decor(moonAt, MOON_AWAKE, { hidden: true })
  const moonLight = r.lamp([moonAt[0], CLOUD_TOP + 0.9, 1], { color: '#cfe0ff', power: 0.35, reach: 7 })
  r.decor([moonPotX, CLOUD_TOP, POT_Z], POT)
  const moonFlower = r.decor([moonPotX, CLOUD_TOP + 0.55, POT_Z], MOON_FLOWER, { hidden: true })

  // The moon's own seed waits on the cupboard; set down in the moon's pot, it blooms at once and the moon wakes.
  const moonSeed = r.thing([-7.4, 2.4, 0], MOON_SEED, { weight: 0.3, name: 'moon-seed' })
  moonSeed.glow('#dfe8ff', true)
  let bloomed = false
  const moonPot = r.zone([moonPotX, CLOUD_TOP + 0.6, 0], [1.2, 1.2, 1.4], {
    name: 'moon-pot',
    stay: (who) => {
      if (bloomed || who !== moonSeed || moonSeed.heldBy() !== null) return
      bloomed = true
      moonSeed.hide()
      moonFlower.show()
    },
  })

  // The way out stands on the shelf by the right wall, in sight from everywhere.
  r.wayOut([7.4, 2.4, 0])

  w.players()[0].putAt(START)

  r.steps([
    { hint: { en: 'Take a glowing seed to a pot', fi: 'Vie hehkuva siemen ruukulle' }, at: pots[0], done: () => planted.some((p) => p) },
    { hint: { en: 'Fill the can in the pond, then water', fi: 'Täytä kannu lammesta ja kastele siemen' }, at: pond, done: () => grownCount() >= 1 },
    { hint: { en: 'Every pot wants a seed and water', fi: 'Jokainen ruukku haluaa siemenen ja vettä' }, at: pots[n - 1], done: () => grownCount() === n },
    { hint: { en: 'Take the moon seed up to the moon', fi: 'Vie kuun siemen kuun luo' }, at: moonPot, done: () => bloomed },
  ])

  return () => {
    if (woke || w.stepsDone() < 4) return
    woke = true
    asleep.hide()
    awake.show()
    snore.hide()
    moonLight.set({ power: 1, reach: 14 })
    w.sound('bell')
    w.puff([moonPotX, CLOUD_TOP + 1.2, 0], 'star', { color: '#fff3b0', count: 40, size: 0.25 })
    w.after(2, () => w.finish())
  }
}

/**
 * The walkthrough: the pots from the left, for each a seed to it (the pond's first at level 3, before
 * the can is ever set down in the water), then the can to the pond and back to the pot as many times
 * as its flower needs (waterings, as the room counts); then, once the last flower has grown, the
 * moon's seed from the cupboard up the flowers to the moon's pot.
 */
export const walk: WalkCode = function* (bots, w) {
  const b = bots[0]
  const n = SEEDS[w.level() - 1]
  const can = w.get('can') as ThingView
  const order = [6, 1, 4, 5, 2, 3].filter((k) => k <= n)
  for (let i = 0; i < n; i++) {
    yield* b.carry(w.get(`seed-${order[i]}`) as ThingView, w.get(`pot-${i + 1}`))
    for (let k = waterings(n, i, 0); k > 0; k--) {
      yield* b.carry(can, w.get('pond'))
      yield* b.carry(can, w.get(`pot-${i + 1}`))
    }
  }
  const flowers = Array.from({ length: n }, (_, i) => w.get(`flower-${i + 1}`) as MoverView)
  yield* w.until(() => flowers.every((f) => !f.moving()))
  yield* b.carry(w.get('moon-seed') as ThingView, w.get('moon-pot'))
}
