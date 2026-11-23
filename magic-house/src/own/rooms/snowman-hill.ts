/**
 * Magic House's own room for three players: Snow Castle (its id still own:snowman-hill, so saves
 * match). A hall of the snow castle, its walls of ice blocks, with a snowbank at each end, ice
 * shelves over them and two glowing rings on the snow where snowmen will stand: the big one by the
 * right snowbank and the little one by the left. Between them is the rolling ground, where each
 * snowball is shown, small, in turn. Rolled along the snow it grows, after so many metres each
 * time: tiny, little, middle-sized, big. A tiny or little ball one player pushes alone; a middle
 * one needs two; a big one needs all three, and dots over the ball show how many it needs and how
 * many push it now. Rolled into its ring at the size it needs, the ball glides up onto its
 * snowman: first a big ball, then a middle one, then a little head. Then the snowman needs a face
 * and things to wear, found on the ice shelves (the hat on a snow cloud that only the snowman's
 * head reaches); with them all it comes alive, waves, and wants a little friend: a middle ball and
 * a little head in the other ring; from level 2 its friend wants things to wear too. Level makes
 * the balls roll further before they grow (9, 10 and 11 m) and adds things to find (5, 6 and 6 for
 * the snowman, none, 2 and 3 for its friend), so there is more rolling and more fetching at each
 * level and never anything to wait for: the bots' clean pass takes 83 s, 96 s and 104 s. A new
 * snowball is shown at whichever end of the rolling ground is further from every player, so it
 * never comes where a child stands.
 *
 * Laid inside the house's box (engine/api.ts ROOM: x -8 to 8, y 0 to 8): the floor is the
 * house's, and every shelf is jumped up through from below and dropped off, so wherever a player
 * gets to leads back to the floor. The snowmen stand away from the rolling ground, so a ball being
 * rolled never meets one. The snowbanks are plain solids with no colour of their own, which the
 * look (snowman-hill.look.ts) dresses; the castle's furniture, lamps and lights are the look's.
 *
 * Written by hand against the builder (engine/api.ts), as a designer's room would be; never shown
 * to the model (plan.md, How Opus is asked).
 */

import type { Decor, Point, RoomCode, Seen, Solid, SolidView, Thing, ThingView, Who, Zone } from '../../engine/api'
import type { Model } from '../../engine/gift'
import { cos, sin } from '../../engine/math'
import type { WalkCode } from '../../trial/api'
import type { OwnFacts } from './facts'

export const facts: OwnFacts = {
  id: 'own:snowman-hill',
  party: 3,
  seed: 303,
  kind: 'together',
  view: 'side',
  theme: 'a hall of ice blocks in a snow castle, where snowmen are built',
  task: 'roll snowballs together until they grow big enough, stack them into a snowman, find it a face, then build its little friend',
  name: { en: 'Snow Castle', fi: 'Lumilinna' },
  shell: {
    walls: { color: '#86bde8', second: '#aed6f5', pattern: 'checks' },
    floor: { color: '#f2f7fd', second: '#d9e8f7', pattern: 'spots' },
    ceiling: { color: '#78acdc', second: '#e6f3ff', pattern: 'stars' },
    trim: '#ffffff',
    light: 0.9,
  },
}

/** How far a ball rolls before it grows a size, metres, at each level. */
export const GROW = [9, 10, 11]
/** How many things the big snowman needs at each level, and how many its little friend needs. */
export const PART_COUNT = [5, 6, 6]
export const LITTLE_COUNT = [0, 2, 3]
/** The rolling ground's two ends: a ball is rolled from one to the other and back while it grows. */
export const BANK = 2.8

/** A snowball's sizes: radius, metres, and weight, where one child is 1, so the two smallest need one to push them, the middle two and the big one three. */
const SIZES: readonly { r: number; weight: number }[] = [
  { r: 0.26, weight: 0.6 },
  { r: 0.34, weight: 0.9 },
  { r: 0.46, weight: 1.9 },
  { r: 0.6, weight: 2.8 },
]
/** The two snowmen, the big one first: where each stands, and the sizes of its balls, bottom first. */
const SNOWMEN: readonly { x: number; sizes: readonly number[] }[] = [
  { x: 5, sizes: [3, 2, 1] },
  { x: -5, sizes: [2, 1] },
]
/** Every ball in the order they are rolled: which snowman, where it stands, its size, and how high its middle is (as high as the balls under it). */
const BALLS = SNOWMEN.flatMap((man, m) =>
  man.sizes.map((size, i) => ({ man: m, x: man.x, size, y: man.sizes.slice(0, i).reduce((y, u) => y + SIZES[u].r * 2, 0) + SIZES[size].r })),
)
/** Where on the rolling ground a new snowball is shown: at -FROM or FROM, whichever is further from every player, so it never comes where a child stands. The first starts at -FROM. */
const FROM = 2.4
/** The big snowman's head: where its face is worn. */
const SNOWMAN_X = SNOWMEN[0].x
const HEAD_Y = BALLS[2].y
const HEAD_R = SIZES[1].r
const BALL_Y = BALLS.slice(0, 3).map((b) => b.y)
/** The ring round each snowman's foot, where its balls are rolled in and its things set down: half its width, and its height. */
const RING_HALF = 1.7
const RING_HIGH = 1.6

/** The ice shelves over the snowbanks, where the things are found: their middles x and y, and widths (all 0.25 thick). */
const SHELVES: readonly { x: number; y: number; w: number }[] = [
  { x: -6.8, y: 1.875, w: 2.4 },
  { x: -7.1, y: 3.275, w: 1.8 },
  { x: 6.95, y: 1.875, w: 2.1 },
]
/** The snow cloud under the ceiling over the big snowman, its top too high to jump to from a shelf and a jump from the snowman's head. */
const CLOUD: { x: number; top: number; w: number } = { x: SNOWMAN_X - 0.3, top: 4.2, w: 1.6 }

const SNOW = '#f4f8ff'
const ICE = '#bfe2ff'

function snowball(r: number): Model {
  return (m) => {
    m.sphere(r, { at: [0, r, 0], color: SNOW })
    m.sphere(r * 0.3, { at: [r * 0.5, r * 1.4, r * 0.55], color: '#ffffff' })
  }
}

/**
 * The things the snowman needs, each drawn twice: as it lies where it is found (standing at least
 * SIZES.smallest tall on its foot, so a thing rests on a ledge it can be jumped up through), and as
 * the snowman wears it, built round its own middle. Coal is a big lump to find and a small eye to
 * wear; the carrot stands up where it is found and points out of the face when worn.
 */
const COAL: Model = (m) => m.sphere(0.2, { at: [0, 0.2, 0], scale: [1, 1, 0.8], color: '#2b2b33' })
const EYE: Model = (m) => m.sphere(0.07, { color: '#2b2b33' })
const CARROT: Model = (m) => {
  m.cone(0.11, 0.42, { at: [0, 0.21, 0], color: '#ff8a1f' })
  m.cone(0.09, 0.12, { at: [0, 0.48, 0], rot: [Math.PI, 0, 0], color: '#4caf50' })
}
const NOSE: Model = (m) => m.cone(0.06, 0.26, { at: [0, 0, 0.13], rot: [Math.PI / 2, 0, 0], color: '#ff8a1f' })
const HAT: Model = (m) => {
  m.cylinder(0.32, 0.32, 0.05, { at: [0, 0.025, 0], color: '#2b2b33' })
  m.cylinder(0.2, 0.22, 0.38, { at: [0, 0.24, 0], color: '#2b2b33' })
  m.cylinder(0.225, 0.225, 0.06, { at: [0, 0.1, 0], color: '#d6334a' })
}
const SCARF: Model = (m) => {
  m.box(0.4, 0.12, 0.3, { at: [0, 0.06, 0], color: '#e8473d' })
  m.box(0.14, 0.4, 0.06, { at: [0.1, 0.2, 0.12], color: '#e8473d' })
  m.sphere(0.06, { at: [-0.1, 0.16, 0.1], color: '#ffffff' })
}
const WORN_SCARF: Model = (m) => {
  m.torus(0.4, 0.07, { rot: [Math.PI / 2, 0, 0], color: '#e8473d' })
  m.box(0.12, 0.34, 0.06, { at: [0.16, -0.18, 0.42], color: '#e8473d' })
}
const STICK: Model = (m) => {
  m.cylinder(0.035, 0.045, 0.7, { at: [0, 0.35, 0], color: '#7a4b2a' })
  m.cylinder(0.025, 0.03, 0.2, { at: [0.08, 0.5, 0], rot: [0, 0, -Math.PI / 4], color: '#7a4b2a' })
}
const ARM: Model = (m) => {
  m.cylinder(0.035, 0.045, 0.7, { at: [0, 0, 0], rot: [0, 0, Math.PI / 2], color: '#7a4b2a' })
  m.cylinder(0.025, 0.03, 0.2, { at: [0.2, 0.06, 0], rot: [0, 0, Math.PI / 4], color: '#7a4b2a' })
}

/** The things the snowman needs, in the order levels add them: where each is found [x, y], and where it is worn from the snowman's foot. */
const PARTS: readonly { name: string; found: Model; worn: Model; at: Point; wornAt: Point }[] = [
  { name: 'coal-left', found: COAL, worn: EYE, at: [-6.3, 2.0, 0], wornAt: [-0.12, HEAD_Y + 0.08, HEAD_R - 0.04] },
  { name: 'coal-right', found: COAL, worn: EYE, at: [7.4, 2.0, 0], wornAt: [0.12, HEAD_Y + 0.08, HEAD_R - 0.04] },
  { name: 'carrot', found: CARROT, worn: NOSE, at: [-7.4, 3.4, 0], wornAt: [0, HEAD_Y - 0.02, HEAD_R - 0.02] },
  { name: 'hat', found: HAT, worn: HAT, at: [CLOUD.x, CLOUD.top, 0], wornAt: [0, HEAD_Y + HEAD_R - 0.06, 0] },
  { name: 'scarf', found: SCARF, worn: WORN_SCARF, at: [6.5, 2.0, 0], wornAt: [0, BALL_Y[1] + SIZES[2].r - 0.08, 0] },
  { name: 'stick', found: STICK, worn: ARM, at: [-7.3, 2.0, 0], wornAt: [0.75, BALL_Y[1] + 0.1, 0] },
]

/** A knitted bobble hat for the little snowman, its pompom on top: found and worn alike. */
const BOBBLE_HAT: Model = (m) => {
  m.sphere(0.2, { at: [0, 0.08, 0], scale: [1, 0.9, 1], color: '#3d8bff' })
  m.cylinder(0.21, 0.21, 0.1, { at: [0, 0.05, 0], color: '#ffd43a' })
  m.sphere(0.08, { at: [0, 0.3, 0], color: '#ffffff' })
}
const LITTLE_NOSE: Model = (m) => m.cone(0.045, 0.18, { at: [0, 0, 0.09], rot: [Math.PI / 2, 0, 0], color: '#ff8a1f' })
const LITTLE_SCARF: Model = (m) => {
  m.torus(0.3, 0.06, { rot: [Math.PI / 2, 0, 0], color: '#2fbf71' })
  m.box(0.1, 0.26, 0.05, { at: [0.12, -0.14, 0.32], color: '#2fbf71' })
}
const FOUND_LITTLE_SCARF: Model = (m) => {
  m.box(0.36, 0.12, 0.28, { at: [0, 0.06, 0], color: '#2fbf71' })
  m.box(0.12, 0.36, 0.06, { at: [0.1, 0.18, 0.11], color: '#2fbf71' })
  m.sphere(0.06, { at: [-0.1, 0.15, 0.1], color: '#ffd43a' })
}

/** What the little snowman needs from level 2 on, in the order levels add them: where each is found, and where it is worn from its foot. */
const LITTLE_HEAD_Y = BALLS[4].y
const LITTLE_PARTS: readonly { name: string; found: Model; worn: Model; at: Point; wornAt: Point }[] = [
  { name: 'bobble-hat', found: BOBBLE_HAT, worn: BOBBLE_HAT, at: [-6.6, 3.4, 0], wornAt: [0, LITTLE_HEAD_Y + SIZES[1].r - 0.12, 0] },
  { name: 'little-carrot', found: CARROT, worn: LITTLE_NOSE, at: [7.0, 2.0, 0], wornAt: [0, LITTLE_HEAD_Y - 0.02, SIZES[1].r - 0.02] },
  { name: 'little-scarf', found: FOUND_LITTLE_SCARF, worn: LITTLE_SCARF, at: [-6.9, 2.0, 0], wornAt: [0, SIZES[2].r * 2 - 0.04, 0] },
]

/** An ice shelf to jump up onto from below, w wide, its top at its model's top, with icicles under its front edge. */
function shelf(w: number): Model {
  return (m) => {
    m.box(w, 0.25, 1, { at: [0, 0.125, 0], color: ICE })
    m.box(w + 0.1, 0.1, 1.05, { at: [0, 0.27, 0], color: '#ffffff' })
    const n = Math.round(w / 0.35)
    for (let i = 0; i < n; i++) {
      const long = 0.16 + 0.12 * ((i * 5) % 3) / 2
      m.cone(0.05, long, { at: [-w / 2 + 0.17 + (i * (w - 0.34)) / (n - 1), -long / 2, 0.42], rot: [Math.PI, 0, 0], color: '#dff2ff' })
    }
  }
}

/** A little snow cloud to stand on, w wide, drawn as puffs over its box. */
function cloud(w: number): Model {
  return (m) => {
    m.box(w, 0.2, 0.8, { at: [0, 0.12, 0], color: '#eef6ff' })
    const n = Math.max(2, Math.round(w / 0.55))
    for (let i = 0; i < n; i++) m.sphere(0.3, { at: [-w / 2 + 0.3 + ((w - 0.6) * i) / (n - 1), 0.2, 0], scale: [1, 0.7, 1], color: '#ffffff' })
  }
}

/** A ring on the snow where a snowman will stand, glowing so it is seen from anywhere. */
const RING: Model = (m) => {
  m.torus(RING_HALF - 0.2, 0.08, { rot: [Math.PI / 2, 0, 0], scale: [1, 0.5, 1], color: '#7fc8ff', glow: true })
}

/** The little snowman's eyes and smile, shown with its head. */
const LITTLE_FACE: Model = (m) => {
  m.sphere(0.05, { at: [-0.1, 0.06, 0.3], color: '#2b2b33' })
  m.sphere(0.05, { at: [0.1, 0.06, 0.3], color: '#2b2b33' })
  for (let i = 0; i < 3; i++) m.sphere(0.025, { at: [-0.06 + i * 0.06, -0.11 + (i === 1 ? -0.02 : 0), 0.3], color: '#2b2b33' })
}

/** A smile of coal, shown on the big snowman when it comes alive. */
const SMILE: Model = (m) => {
  for (let i = 0; i < 5; i++) {
    const a = Math.PI * (1.2 + (0.6 * i) / 4)
    m.sphere(0.035, { at: [0.15 * cos(a), 0.15 * sin(a), 0], color: '#2b2b33' })
  }
}

export const room: RoomCode = (r, w) => {
  const level = w.level()
  const grow = GROW[level - 1]
  const parts = PARTS.slice(0, PART_COUNT[level - 1])
  const littleParts = LITTLE_PARTS.slice(0, LITTLE_COUNT[level - 1])
  const players = w.players()

  // Snowbanks at both ends: a ball rolled into one rolls back, and they are the way up to the ice shelves over them. Plain, for the look to dress.
  r.ramp([-7.25, 0.375, 0], [1.5, 0.75, 2], 'left', { name: 'left snowbank' })
  r.ramp([7.25, 0.375, 0], [1.5, 0.75, 2], 'right', { name: 'right snowbank' })
  // The ice shelves the things are found on, ringing a little when a player lands on them, and the snow cloud over the snowman for the hat.
  SHELVES.forEach((s, i) =>
    r.box([s.x, s.y, 0], [s.w, 0.25, 1], {
      through: true,
      color: ICE,
      model: shelf(s.w),
      name: `shelf-${i + 1}`,
      land: (who) => {
        if (who.kind() === 'player') w.sound('chime')
      },
    }),
  )
  r.box([CLOUD.x, CLOUD.top - 0.125, 0], [CLOUD.w, 0.25, 1], { through: true, color: '#eef6ff', model: cloud(CLOUD.w), name: 'hat-cloud' })

  // The rings where the snowmen stand, and their balls, shown one by one as each is rolled in.
  const stack: Solid[] = BALLS.map((b, i) => r.ball([b.x, b.y, 0], SIZES[b.size].r, { through: true, color: SNOW, hidden: true, name: `snowman-${i + 1}` }))
  const worn: Decor[] = parts.map((p) => r.decor([SNOWMAN_X + p.wornAt[0], p.wornAt[1], p.wornAt[2]], p.worn, { hidden: true }))
  const arm = r.decor([SNOWMAN_X - 0.75, BALL_Y[1] + 0.1, 0], ARM, { hidden: true })
  const smile = r.decor([SNOWMAN_X, HEAD_Y - 0.1, HEAD_R - 0.03], SMILE, { hidden: true })
  // Its face comes with its head; a nose too, at the level where its carrot is not one of the things to find.
  const littleFace: Decor[] = [r.decor([BALLS[4].x, BALLS[4].y, 0], LITTLE_FACE, { hidden: true })]
  if (!littleParts.some((p) => p.name === 'little-carrot')) littleFace.push(r.decor([BALLS[4].x, BALLS[4].y - 0.02, SIZES[1].r - 0.02], LITTLE_NOSE, { hidden: true }))
  const littleWorn: Decor[] = littleParts.map((p) => r.decor([BALLS[3].x + p.wornAt[0], p.wornAt[1], p.wornAt[2]], p.worn, { hidden: true }))

  // Each ball is a snowball in each size up to the one it needs, built hidden where it starts; the one shown is the one being rolled.
  const balls: Thing[][] = BALLS.map((b, k) =>
    SIZES.slice(0, b.size + 1).map((s, size) =>
      r.thing([-FROM, 0, 0], snowball(s.r), { round: true, weight: s.weight, hidden: k > 0 || size > 0, name: `snowball-${k + 1}-${size + 1}` }),
    ),
  )
  let slot = 0
  let size = 0
  let rolled = 0
  let lastX = -FROM
  let gliding = false
  const rolling = () => balls[slot][size]
  const need = r.sign([-FROM, SIZES[0].r * 2 + 0.7, 0], { count: 0, of: 1 })
  /** Shows the next ball, small, at the end of the rolling ground further from every player. */
  const nextBall = () => {
    const next = rolling()
    const clear = (x: number) => Math.min(...players.map((p) => Math.abs(p.at()[0] - x)))
    const x = clear(FROM) > clear(-FROM) ? FROM : -FROM
    next.putAt([x, 0, 0])
    next.show()
    need.show()
    lastX = x
    w.puff(next.at(), 'snow', { count: 12 })
  }

  const found: boolean[] = parts.map(() => false)
  const things: Thing[] = parts.map((p) => r.thing(p.at, p.found, { weight: 0.2, name: p.name }))
  const faceDone = () => found.every((f) => f)
  const littleFound: boolean[] = littleParts.map(() => false)
  const littleThings: Thing[] = littleParts.map((p) => r.thing(p.at, p.found, { weight: 0.2, name: p.name }))
  /** A thing set down in the ring of the snowman that needs it, once that snowman stands, goes where it is worn. */
  const wear = (who: Who, list: readonly Thing[], got: boolean[], shown: readonly Decor[]) => {
    const i = list.findIndex((t) => t === who)
    if (i < 0 || got[i] || list[i].heldBy() !== null) return
    got[i] = true
    list[i].hide()
    shown[i].show()
    w.puff(shown[i].at(), 'star', { count: 12 })
    w.sound('pop')
  }
  const rings: Zone[] = SNOWMEN.map((man, m) => {
    r.decor([man.x, 0.02, 0], RING)
    return r.zone([man.x, RING_HIGH / 2, 0], [RING_HALF * 2, RING_HIGH, 2], {
      name: m === 0 ? 'ring' : 'little-ring',
      // A player stepping into a ring makes its snow sparkle, before its turn too.
      enter: (who) => {
        if (who.kind() === 'player') w.puff([who.at()[0], 0.2, 0.4], 'snow', { count: 6 })
      },
      stay: (who) => {
        if (who.kind() !== 'thing') return
        // A snowball of the size its place needs glides up onto its snowman.
        if (slot < BALLS.length && !gliding && who === rolling() && BALLS[slot].man === m && size === BALLS[slot].size) {
          gliding = true
          const ball = rolling()
          const b = BALLS[slot]
          ball.slideTo([b.x, b.y - SIZES[size].r, 0], 0.6)
          w.sound('whoosh')
          w.after(0.6, () => {
            ball.hide()
            stack[slot].show()
            w.puff([b.x, b.y, 0], 'snow', { count: 24, size: 0.2 })
            w.sound('magic')
            slot += 1
            size = 0
            rolled = 0
            gliding = false
            need.hide()
            if (slot === BALLS.length) for (const d of littleFace) d.show()
            else if (slot !== 3) nextBall()
          })
          return
        }
        // Once a snowman stands, each thing it needs that is set down in its ring goes where it is worn.
        if (m === 0 && slot >= 3) wear(who, things, found, worn)
        if (m === 1 && slot === BALLS.length) wear(who, littleThings, littleFound, littleWorn)
      },
    })
  })

  players.forEach((p, i) => p.putAt([-0.7 + i * 0.7, 0, 0]))
  r.wayOut([0, 0, 0])

  r.steps([
    { hint: { en: 'Roll the snowball to make it big', fi: 'Pyöritä lumipalloa, niin se kasvaa' }, at: rings[0], done: () => slot >= 1 },
    { hint: { en: 'Roll one more for the middle', fi: 'Pyöritä vielä yksi keskelle' }, at: rings[0], done: () => slot >= 2 },
    { hint: { en: 'A little ball for the head', fi: 'Pieni pallo pääksi' }, at: rings[0], done: () => slot >= 3 },
    { hint: { en: 'Find the snowman a face', fi: 'Etsi lumiukolle kasvot' }, at: rings[0], done: faceDone },
    { hint: { en: 'The snowman wants a little friend', fi: 'Lumiukko haluaa pienen kaverin' }, at: rings[1], done: () => slot === BALLS.length },
    ...(littleParts.length === 0 ? [] : [{ hint: { en: 'Dress the little friend too', fi: 'Pue pieni kaverikin' }, at: rings[1], done: () => littleFound.every((f) => f) }]),
  ])

  // Tapped, a snowman part giggles once the snowman is alive.
  let alive = false
  r.tap((at) => {
    if (!alive || Math.abs(at[0] - SNOWMAN_X) > 0.7 || at[1] > HEAD_Y + HEAD_R + 0.4) return
    w.sound('giggle')
    w.puff([SNOWMAN_X, HEAD_Y + 0.5, 0.4], 'heart', { count: 6 })
  })

  let ended = false
  return () => {
    // Snow falls softly all the time, a flake here and there.
    if (w.time() % 0.5 < 1 / 60) w.puff([((Math.floor(w.time() * 2) * 7.3) % 16) - 8, 7.5, -1], 'snow', { count: 3, size: 0.12 })
    if (slot < BALLS.length && !gliding && !rolling().hidden()) {
      // The ball grows with the snow it rolls over, and the dots over it show how many push it and how many it needs.
      const ball = rolling()
      const at = ball.at()
      const s = SIZES[size]
      rolled += Math.abs(at[0] - lastX)
      lastX = at[0]
      if (size < BALLS[slot].size && rolled >= grow * (size + 1)) {
        const dir = ball.velocity()[0] < 0 ? -1 : 1
        const next = balls[slot][size + 1]
        next.putAt([at[0] + dir * (SIZES[size + 1].r - s.r), at[1], 0])
        next.show()
        ball.hide()
        size += 1
        lastX = next.at()[0]
        w.puff([at[0], at[1] + s.r, 0], 'snow', { count: 16, size: 0.2 })
        w.sound('pop')
      }
      const now = rolling().at()
      const rr = SIZES[size].r
      const pushing = players.filter((p) => {
        const pa = p.at()
        const side = pa[0] < now[0] ? 1 : -1
        return p.standingOn() !== null && Math.abs(Math.abs(pa[0] - now[0]) - rr - 0.25) < 0.15 && p.stick()[0] * side > 0.2 && Math.abs(pa[1] - now[1]) < 0.6
      }).length
      need.putAt([now[0], now[1] + rr * 2 + 0.7, 0])
      const needs = Math.ceil(SIZES[size].weight)
      need.write({ count: Math.min(pushing, needs), of: needs })
    }
    if (!alive && w.stepsDone() >= 4) {
      // With its face the snowman comes alive, smiles, waves its stick arm, and a little snowball comes for its friend.
      alive = true
      arm.show()
      smile.show()
      for (let k = 0; k < 4; k++) w.after(0.4 * k, () => arm.turnTo(k % 2 === 0 ? -0.5 : 0.1, 0.35))
      w.puff([SNOWMAN_X, HEAD_Y + 0.6, 0], 'heart', { count: 24 })
      w.sound('giggle')
      nextBall()
    }
    if (ended || w.stepsDone() < (littleParts.length === 0 ? 5 : 6)) return
    ended = true
    w.puff([SNOWMAN_X, HEAD_Y, 0], 'snow', { count: 30, size: 0.2 })
    w.puff([BALLS[4].x, BALLS[4].y + 0.5, 0], 'heart', { count: 20 })
    w.sound('yay')
    w.after(2.5, () => w.finish())
  }
}

/**
 * The walkthrough: all three push each snowball from its far side, to the far end of the rolling
 * ground and back while it grows, and into its ring once it has the size its place needs. After
 * the big snowman's three balls, each bot fetches things for its face, one after another, and sets
 * them down in its ring; then the little snowman's two balls.
 */
export const walk: WalkCode = function* (bots, w) {
  const sizes = BALLS.map((b) => b.size + 1)
  const roll = function* (k: number) {
    const ring = w.get(BALLS[k - 1].man === 0 ? 'ring' : 'little-ring')
    const shown = () => Array.from({ length: sizes[k - 1] }, (_, i) => w.get(`snowball-${k}-${i + 1}`) as ThingView).findIndex((b) => !b.hidden())
    const stood = w.get(`snowman-${k}`) as SolidView
    for (;;) {
      // A ball that grows at the edge of its ring is taken by it at once.
      yield* w.until(() => shown() >= 0 || !stood.hidden())
      if (!stood.hidden()) return
      const i = shown() + 1
      const ball = w.get(`snowball-${k}-${i}`) as ThingView
      if (i === sizes[k - 1]) {
        yield* w.together(...bots.map((b) => b.push(ball, ring)))
        break
      }
      // It grows as it rolls: to the far end of the rolling ground and back until it has its size.
      yield* w.together(...bots.map((b) => b.push(ball, [ball.at()[0] < 0 ? BANK : -BANK, 0, 0])))
    }
    yield* w.until(() => !stood.hidden())
  }
  const fetch = (names: readonly string[], ring: Seen) =>
    w.together(
      ...bots.map((b, j) =>
        (function* () {
          for (let i = j; i < names.length; i += bots.length) yield* b.carry(w.get(names[i]) as ThingView, ring)
        })(),
      ),
    )
  for (let k = 1; k <= 3; k++) yield* roll(k)
  yield* fetch(PARTS.slice(0, PART_COUNT[w.level() - 1]).map((p) => p.name), w.get('ring'))
  for (let k = 4; k <= 5; k++) yield* roll(k)
  yield* fetch(LITTLE_PARTS.slice(0, LITTLE_COUNT[w.level() - 1]).map((p) => p.name), w.get('little-ring'))
}
