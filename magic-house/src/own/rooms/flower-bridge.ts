/**
 * Magic House's own room seen from high up, for two players: Flower Bridge. A flower shop with a
 * canal running through it. The flowers grow up on the garden terrace at the back, too high to jump
 * onto from the floor; the shop's vases stand along its front, each in a colour of its own, and the
 * way out is in the corner across the canal. Stairs by the canal climb to a landing against the left
 * wall, and the bridge's plank lies drawn back over the landing, which reaches under all of it. While anyone stands on one of the two
 * round stones (one on the shop's floor by the right wall, one up on the terrace), the plank slides
 * out across the canal onto the terrace, and when nobody does it slides back (taking whoever stands
 * on it with it). So one player holds a stone while the other climbs the stairs, crosses, picks a
 * flower and brings it down to the vase of its colour (back over the bridge, or with a jump off the
 * terrace into the canal, shallow and slow to wade). Only a flower set down in a vase of its own
 * colour goes into it; a vase of another colour says no.
 *
 * Level adds a colour and flowers: three vases and 13 flowers, then four and 15, then five and 16,
 * more to carry at each level and never more to wait for; the bots' clean pass takes 87 s, 98 s and
 * 103 s.
 *
 * Laid inside the house's floor (engine/api.ts ROOM.high: x -7 to 7, z -4 to 4, players under y 3).
 * The canal is a zone of slow water on the house's floor: the floor is the house's, so there is no
 * pit, and the terrace is what the bridge is for. Its top is 1.7 m up: over a held jump from the
 * floor (FEEL.jumpHigh 1.6 m), and from it a jump hardly lifts the feet under the 3 m top, so it
 * carries them about a metre: the bridge's plank drawn back stands 2.6 m from the terrace, the
 * landing 2 m. Every flower grows on the terrace, since anything loose on the shop's side is a step
 * up onto it (from any top a jump lifts the feet to 1.85 m) for a player alone. Wherever a player can
 * get down to (the canal, the corner, the floor in front of the landing) is the house's floor, from which the
 * stairs lead back up. The terrace, the landing and the stairs are plain solids with no colour of
 * their own, which the look (flower-bridge.look.ts) dresses; what the play colours (the flowers, the
 * vases, the bridge and the stones) is what the players play with.
 *
 * Written by hand against the builder (engine/api.ts), as a designer's room would be; never shown
 * to the model (plan.md, How Opus is asked).
 */

import type { Decor, Mover, Point, RoomCode, Thing, ThingView, Who, Zone } from '../../engine/api'
import type { Model } from '../../engine/gift'
import { cos, sin } from '../../engine/math'
import type { WalkCode } from '../../trial/api'
import type { OwnFacts } from './facts'

export const facts: OwnFacts = {
  id: 'own:flower-bridge',
  party: 2,
  seed: 250,
  kind: 'together',
  view: 'high',
  theme: 'a flower shop with a canal running through it',
  task: 'hold a round stone so the bridge slides over the canal, and bring every flower down from the garden terrace to the vase of its colour',
  name: { en: 'Flower Bridge', fi: 'Kukkasilta' },
  shell: {
    walls: { color: '#ffd9e6', second: '#fff3f7', pattern: 'stripes' },
    floor: { color: '#d9a46a', second: '#c99358', pattern: 'stripes' },
    ceiling: { color: '#fff3f7', second: '#fff3f7', pattern: 'plain' },
    trim: '#ffffff',
    light: 1,
  },
}

/** The garden terrace at the back, from the left wall: its right end, its front edge and its top. */
export const TERRACE: { readonly right: number; readonly front: number; readonly top: number } = { right: 3.5, front: -1.6, top: 1.7 }
/** The canal, from wall to wall along the terrace's front: its near edge (its far edge is the terrace's front). */
export const CANAL_NEAR = 0.4
/** The bridge's plank: its middle across x, its width, and its ends across the canal when it is out (z); drawn back, it lies `BACK` further toward the viewer. */
const PLANK_X = -5.8
const PLANK_W = 1.4
const PLANK_ENDS = [TERRACE.front - 0.25, 1] as const
const BACK = PLANK_ENDS[1] - PLANK_ENDS[0]
/** The landing against the left wall, from the canal: its right side and its front, reaching under the drawn-back plank's near end so nobody stands under the plank, where the high camera could not see them. The stairs climb to it from the right, up to STAIRS_FRONT. */
const LANDING_RIGHT = -4.6
const LANDING_FRONT = PLANK_ENDS[1] + BACK + 0.05
const STAIRS_FRONT = 2
const STAIRS_RUN = 1.9
/** How long the plank takes to slide out or back, seconds. */
const SLIDE = 1.2
/** The round stones: one on the shop's floor by the right wall, one up on the terrace at its right end. */
export const STONES: readonly Point[] = [
  [5.6, 0, 1.4],
  [2.85, TERRACE.top, -2.9],
]
/** Where the players start: on the shop's floor between the canal and the vases. */
const STARTS: readonly Point[] = [
  [0.5, 0, 1.9],
  [2, 0, 1.9],
]

/** The vases' colours, a vase each: at each level a colour more. */
const COLOURS = ['#ff6fa8', '#ffd23a', '#5ec8ff', '#b57bff', '#ff9f43']
export const VASES = [3, 4, 5]
/** How many flowers grow on the terrace at each level. */
export const FLOWERS = [13, 15, 16]
/** Where the vases stand along the front of the shop, the first farthest from the stairs. */
const VASE_XS = [5.6, 3.6, 1.6, -0.4, -2.4]
const VASE_Z = 3.1
/** Where the flowers grow on the terrace, in two rows from its right end with a path between the rows, in the order they are used. */
const SPOTS: readonly Point[] = Array.from({ length: 16 }, (_, i) => [2 - Math.floor(i / 2) * 0.8 - (i % 2) * 0.4, TERRACE.top, i % 2 === 0 ? -2.25 : -3.55])
const STONE_GLOW = '#fff3a0'
const WATER = '#4fb3e8'
const PLANK = '#c98b4f'
const PLANK_DARK = '#9c6a3a'

/** A bunch of flowers: stems, leaves and a head of petals round a yellow middle, in one colour. */
function flower(petal: string): Model {
  return (m) => {
    m.cylinder(0.03, 0.03, 0.45, { at: [0, 0.22, 0], color: '#4caf50' })
    m.sphere(0.09, { at: [0.1, 0.25, 0], scale: [1.6, 0.5, 0.8], color: '#5cc85a' })
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      m.sphere(0.12, { at: [cos(a) * 0.15, 0.55, sin(a) * 0.15], scale: [1, 0.6, 1], color: petal })
    }
    m.sphere(0.09, { at: [0, 0.58, 0], color: '#ffe066' })
  }
}

/** A vase in its colour, wide at the belly and narrow at the neck, on a white stand. */
function vase(colour: string): Model {
  return (m) => {
    m.cylinder(0.42, 0.42, 0.08, { at: [0, 0.04, 0], color: '#ffffff' })
    m.sphere(0.3, { at: [0, 0.36, 0], scale: [1, 0.95, 1], color: colour })
    m.cylinder(0.15, 0.2, 0.25, { at: [0, 0.68, 0], color: colour })
    m.torus(0.15, 0.04, { at: [0, 0.81, 0], rot: [Math.PI / 2, 0, 0], color: '#ffffff' })
  }
}

/** The k-th of `of` flowers standing in a vase once it holds them: fanned out over its neck. */
function bloom(petal: string, k: number, of: number): Model {
  return (m) => {
    const a = of === 1 ? 0 : -0.7 + (1.4 * k) / (of - 1)
    const x = sin(a) * 0.32
    const y = 0.83 + cos(a) * 0.45
    m.cylinder(0.025, 0.025, 0.5, { at: [x / 2, 0.83 + (y - 0.83) / 2, 0], rot: [0, 0, -a], color: '#4caf50' })
    for (let i = 0; i < 5; i++) {
      const b = (i / 5) * Math.PI * 2
      m.sphere(0.1, { at: [x + cos(b) * 0.12, y, sin(b) * 0.12], scale: [1, 0.6, 1], color: petal })
    }
    m.sphere(0.07, { at: [x, y + 0.02, 0], color: '#ffe066' })
  }
}

/** A round stepping stone, flat on the floor. */
const STONE: Model = (m) => {
  m.cylinder(0.6, 0.65, 0.08, { at: [0, 0.04, 0], color: '#b9b2a6' })
  m.cylinder(0.42, 0.42, 0.02, { at: [0, 0.09, 0], color: '#d8d2c6' })
}

/** The bridge's plank, `length` long: boards across it, and low rails along both sides that touch nothing. */
function plank(length: number): Model {
  return (m) => {
    m.box(PLANK_W, 0.24, length, { at: [0, 0.12, 0], color: PLANK_DARK })
    const boards = Math.round(length / 0.32)
    for (let i = 0; i < boards; i++) m.box(PLANK_W - 0.04, 0.06, length / boards - 0.04, { at: [0, 0.27, -length / 2 + (i + 0.5) * (length / boards)], color: PLANK })
    for (const x of [-PLANK_W / 2 + 0.05, PLANK_W / 2 - 0.05]) {
      m.box(0.06, 0.06, length, { at: [x, 0.62, 0], color: PLANK })
      for (let i = 0; i <= 4; i++) m.box(0.07, 0.32, 0.07, { at: [x, 0.46, -length / 2 + 0.1 + ((length - 0.2) * i) / 4], color: PLANK_DARK })
    }
  }
}

export const room: RoomCode = (r, w) => {
  const level = w.level()
  const vases = VASES[level - 1]
  const n = FLOWERS[level - 1]
  const players = w.players()

  // The garden terrace along the back wall, the landing against the left wall and the stairs up to it from the right: plain, for the look to dress.
  const terraceW = TERRACE.right + 7
  r.box([-7 + terraceW / 2, TERRACE.top / 2, (-4 + TERRACE.front) / 2], [terraceW, TERRACE.top, TERRACE.front + 4], { name: 'terrace' })
  const landingW = LANDING_RIGHT + 7
  r.box([-7 + landingW / 2, TERRACE.top / 2, (CANAL_NEAR + LANDING_FRONT) / 2], [landingW, TERRACE.top, LANDING_FRONT - CANAL_NEAR], { name: 'landing' })
  r.ramp([LANDING_RIGHT + STAIRS_RUN / 2, TERRACE.top / 2, (CANAL_NEAR + STAIRS_FRONT) / 2], [STAIRS_RUN, TERRACE.top, STAIRS_FRONT - CANAL_NEAR], 'left', { name: 'stairs' })

  // The canal: shallow water from wall to wall along the terrace's front, slow to wade, that splashes whoever comes in.
  r.zone([0, 0.15, (TERRACE.front + CANAL_NEAR) / 2], [14, 0.3, CANAL_NEAR - TERRACE.front], {
    color: WATER,
    drag: 0.7,
    name: 'canal',
    enter: (who) => {
      if (who.kind() !== 'player') return
      w.sound('splash')
      w.puff(who.at(), 'drop', { color: '#bfe6ff', count: 10 })
    },
  })

  // The bridge: a plank drawn back over the landing, which slides out across the canal onto the terrace.
  const bridge: Mover = r.mover(
    () => r.box([0, 0, 0], [PLANK_W, 0.3, BACK], { color: PLANK, model: plank(BACK) }),
    () => ({ at: [PLANK_X, TERRACE.top - 0.15, (PLANK_ENDS[0] + PLANK_ENDS[1]) / 2 + BACK] }),
    { name: 'bridge' },
  )

  // The round stones: while anyone stands on one, the bridge stays out. Each glows while the bridge is back, and chimes when a player steps on it.
  const looks: Decor[] = STONES.map((at) => r.decor(at, STONE))
  for (const d of looks) d.glow(STONE_GLOW, true)
  const stones: Zone[] = STONES.map(([x, y, z], i) =>
    r.zone([x, y + 0.5, z], [1.6, 1, 1.6], {
      name: i === 0 ? 'near-stone' : 'far-stone',
      enter: (who) => {
        if (who.kind() === 'player') w.sound('chime')
      },
    }),
  )

  // The flowers, each in a vase's colour in turn, and the vases they go to, with the count.
  const flowers: Thing[] = SPOTS.slice(0, n).map((at, i) => r.thing(at, flower(COLOURS[i % vases]), { weight: 0.2, name: `flower-${i + 1}` }))
  const placed: boolean[] = flowers.map(() => false)
  /** The vase each flower was last refused by, so it says no once each time a flower is set down in it. */
  const refused: (number | null)[] = flowers.map(() => null)
  // The count hangs over the canal, where it covers only water and the terrace's face, never a vase or a child.
  const counter = r.sign([0.6, 2, 0.2], { count: 0, of: n })
  let done = 0
  for (let k = 0; k < vases; k++) {
    const at: Point = [VASE_XS[k], 0, VASE_Z]
    // A vase rings when tapped, before its turn too.
    r.decor(at, vase(COLOURS[k]), {
      tap: () => {
        w.sound('xylophone')
        w.puff([at[0], 1, at[2]], 'note', { color: COLOURS[k], count: 4 })
      },
    })
    const per = Math.ceil((n - k) / vases)
    const blooms = Array.from({ length: per }, (_, j) => r.decor(at, bloom(COLOURS[k], j, per), { hidden: true }))
    let filled = 0
    r.zone([at[0], 0.6, at[2]], [1.2, 1.2, 1.2], {
      name: `vase-${k + 1}`,
      stay: (who) => {
        const i = flowers.findIndex((f) => f === who)
        if (i < 0 || placed[i] || flowers[i].heldBy() !== null) return
        if (i % vases !== k) {
          if (refused[i] === k) return
          refused[i] = k
          w.sound('boing')
          w.puff([at[0], 1, at[2]], 'dust', { count: 6 })
          return
        }
        placed[i] = true
        flowers[i].hide()
        blooms[filled].show()
        filled += 1
        done += 1
        counter.write({ count: done, of: n })
        w.sound('magic')
        w.puff([at[0], 1.2, at[2]], 'confetti', { color: COLOURS[k], count: 14 })
      },
      leave: (who) => {
        const i = flowers.findIndex((f) => f === who)
        if (i >= 0 && refused[i] === k) refused[i] = null
      },
    })
  }

  players.forEach((p, i) => p.putAt(STARTS[i]))
  r.wayOut([7, 0, -2.9])

  let out = false
  const isPlayer = (who: Who) => who.kind() === 'player'
  r.steps([
    { hint: { en: 'Stand on a round stone', fi: 'Seiso pyöreällä kivellä' }, at: stones[0], done: () => out && !bridge.moving() },
    { hint: { en: 'Walk over the bridge', fi: 'Kävele sillan yli' }, at: bridge, done: () => players.some((p) => p.at()[2] < TERRACE.front && p.at()[1] > TERRACE.top - 0.1) },
    { hint: { en: 'Each flower to its own colour', fi: 'Vie kukka saman väriseen maljakkoon' }, at: flowers[0], done: () => done === n },
  ])

  return () => {
    const held = stones.some((s) => s.inside().some(isPlayer))
    if (held !== out) {
      out = held
      bridge.slideBy(out ? [0, 0, -BACK] : [0, 0, 0], SLIDE)
      w.sound('whoosh')
      for (const d of looks) d.glow(STONE_GLOW, !out)
    }
    if (done === n) w.finish()
  }
}

/**
 * The walkthrough: the first bot stands on the near stone and stays, so the bridge slides out and
 * stays; once it is out, the second brings the flowers to their vases one at a time, those on the
 * terrace first, then those across the canal.
 */
export const walk: WalkCode = function* (bots, w) {
  const [holder, carrier] = bots
  yield* holder.goTo(w.get('near-stone'))
  yield* w.until(() => w.stepsDone() >= 1)
  const level = w.level()
  const vases = VASES[level - 1]
  const n = FLOWERS[level - 1]
  for (let i = 0; i < n; i++) yield* carrier.carry(w.get(`flower-${i + 1}`) as ThingView, w.get(`vase-${(i % vases) + 1}`))
}
