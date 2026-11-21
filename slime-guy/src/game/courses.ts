/**
 * The five islands, in COURSE_IDS order. Each runs along x = 0 from z = 0 over water to
 * its finish arch and the tower behind it, and brings one new thing mixed with the old:
 * Park is her course in her order (a spinner with one slow arm, a fan, climbing frames, a
 * hole, the finish), Beach narrow bridges, Candy Land marshmallow cushions, Snow Land ice
 * slides and snow gates, Star Night everything (two spinners back to back, three fans in a
 * row). The balls lie along good lines, so following them is following the course.
 *
 * Every course keeps the same promises, which courses.test.ts checks: no hole near a
 * spinner, fan or gate (a knock or a push back lands on track), a quiet stretch round
 * every obstacle, flags every two or three obstacles, three babies (one over a jump, one
 * in a fan's wind just before its cage, one at the end of a side path reached by a short
 * bridge), and a tower whose every circle leaves a way past for the biggest slime.
 */

import type { BabySpec, BallSpec, CircleNumber, CircleSpec, Course, CourseId, FanSpec, Ground, SpinnerSpec } from './model'
import { COURSE_IDS, TRACK_HALF } from './model'
import { BALL_Y } from './sim'

// ------------------------------------------------------------------ helpers

/** Main track from z0 to z1. */
const main = (z0: number, z1: number): Ground => ({ x0: -TRACK_HALF, x1: TRACK_HALF, z0, z1 })
/** A narrow bridge, 2.2 wide, on the main line. */
const bridge = (z0: number, z1: number): Ground => ({ x0: -1.1, x1: 1.1, z0, z1 })

/** n balls evenly along a line from (x0, z0) to (x1, z1), floating at ball height. */
function line(x0: number, z0: number, x1: number, z1: number, n: number): BallSpec[] {
  const balls: BallSpec[] = []
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1)
    balls.push({ x: x0 + (x1 - x0) * t, y: BALL_Y, z: z0 + (z1 - z0) * t })
  }
  return balls
}

/** Three balls over the middle of a jump at z: where every size's jump passes when it takes off on time. */
const hop = (x: number, z: number): BallSpec[] => [
  { x, y: 2.2, z: z - 0.9 },
  { x, y: 2.4, z },
  { x, y: 2.2, z: z + 0.9 },
]

/** Three balls high on the flight a cushion at (x, z) throws the slime on, running straight over it. */
const flight = (x: number, z: number): BallSpec[] => [
  { x, y: 4.6, z: z + 1.5 },
  { x, y: 5.4, z: z + 3 },
  { x, y: 4.9, z: z + 4.5 },
]

/** A baby over the middle of a jump at z, where the slime's body passes at every size. */
const overJump = (x: number, z: number): BabySpec => ({ x, y: 1.85, z })
/** A baby high on a cushion's flight. */
const overPad = (x: number, z: number): BabySpec => ({ x, y: 5.05, z: z + 3 })
/** A baby on the track (on a little leaf). */
const onTrack = (x: number, z: number): BabySpec => ({ x, y: 0.1, z })

/**
 * The first circle's height in the tower, and the climb between circles: 5.5 rather than
 * 5, so that even the biggest slime has time to go from one circle's open side to the
 * next one's.
 */
const CIRCLE_FROM = 6
const CIRCLE_GAP = 5.5

/** The tower's circles bottom to top, CIRCLE_GAP apart from CIRCLE_FROM: each its number and where it sits across the shaft. */
const tower = (...circles: [CircleNumber, number][]): CircleSpec[] => circles.map(([n, x], i) => ({ n, x, y: CIRCLE_FROM + CIRCLE_GAP * i }))

/**
 * A spinner beside the track at z: the post in the water on the left (side -1) or the
 * right (+1), its paddle reaching over the whole track, turning so the paddle sweeps the
 * track toward the slime.
 */
const spinner = (z: number, side: -1 | 1, arms: 1 | 2, period: number, phase: number): SpinnerSpec => ({
  x: side * 4.6,
  z,
  reach: 7.9,
  arms,
  period,
  phase,
  dir: side < 0 ? -1 : 1,
})

/** A fan on one half of the track (side -1 left, +1 right), blowing over that half; the other half is free. */
const fan = (z: number, side: -1 | 1, phase: number): FanSpec => ({ x: side * 1.6, z, width: 3.2, reach: 7, phase })

/** The middle of a side path's strip, out from x = 0. */
const STRIP = 5.3

/**
 * A side path on one side (-1 left, +1 right): a bridge 6 long from the track at z0, a
 * narrow strip beside the track to z1, and a wide way back over its last 5 units. Balls
 * lead over the bridge and along the strip, and a baby waits near its end.
 */
function sidePath(side: -1 | 1, z0: number, z1: number): { ground: Ground[]; balls: BallSpec[]; baby: BabySpec } {
  const span = (a: number, b: number) => (side > 0 ? { x0: a, x1: b } : { x0: -b, x1: -a })
  return {
    ground: [
      { ...span(TRACK_HALF, 4.4), z0, z1: z0 + 6 },
      { ...span(4.4, 6.2), z0, z1 },
      { ...span(TRACK_HALF, 6.2), z0: z1 - 5, z1 },
    ],
    balls: [
      { x: side * 2.2, y: BALL_Y, z: z0 - 2 },
      { x: side * 3.7, y: BALL_Y, z: z0 + 1.5 },
      ...line(side * STRIP, z0 + 6, side * STRIP, z1 - 8, 4),
      { x: side * 3.8, y: BALL_Y, z: z1 - 1.5 },
    ],
    baby: onTrack(side * STRIP, z1 - 4.5),
  }
}

// ------------------------------------------------------------------ the islands

const parkSide = sidePath(1, 190, 214)
const park: Course = {
  id: 'park',
  ground: [main(-4, 253), ...parkSide.ground],
  holes: [{ x: 0, z: 172, r: 1.5 }],
  spinners: [spinner(50, -1, 1, 7, 0.1)],
  fans: [fan(96, -1, 0)],
  frames: [
    { z: 122, x0: -TRACK_HALF, x1: TRACK_HALF },
    { z: 140, x0: -TRACK_HALF, x1: TRACK_HALF },
  ],
  pads: [],
  slides: [],
  gates: [],
  flags: [{ z: 66 }, { z: 108 }, { z: 156 }, { z: 186 }],
  balls: [
    ...line(0, 6, 0, 22, 5),
    ...line(1.2, 26, 1.2, 34, 3),
    ...line(0, 40, 0, 60, 6),
    ...line(0, 72, 0, 76, 2),
    ...line(0.8, 80, 1.6, 86, 3),
    ...line(1.6, 99, 1.6, 103, 2),
    ...line(0, 112, 0, 116, 2),
    ...hop(0, 122),
    ...line(0, 129, 0, 133, 2),
    ...line(0, 147, 0, 151, 2),
    ...line(0, 160, 0, 165, 2),
    ...hop(0, 172),
    ...line(0, 179, 0, 183, 2),
    ...parkSide.balls,
    ...line(1.5, 217, 0, 221, 2),
    ...line(0, 226, 0, 231, 2),
  ],
  babies: [overJump(0, 140), onTrack(-1.6, 91.5), parkSide.baby],
  finishZ: 236,
  circles: tower([1, -2.6], [5, 2.7], [1, 2.2], [5, -2.7], [100, 3]),
}

const beachSide = sidePath(-1, 200, 226)
const beach: Course = {
  id: 'beach',
  ground: [main(-4, 34), bridge(34, 58), main(58, 128), bridge(128, 160), main(160, 279), ...beachSide.ground],
  holes: [{ x: 0, z: 182, r: 1.5 }],
  spinners: [spinner(78, 1, 2, 8, 0.3)],
  fans: [fan(110, 1, 1.5)],
  frames: [
    { z: 144, x0: -1.1, x1: 1.1 },
    { z: 244, x0: -TRACK_HALF, x1: TRACK_HALF },
  ],
  pads: [],
  slides: [],
  gates: [],
  flags: [{ z: 62 }, { z: 122 }, { z: 166 }, { z: 196 }, { z: 234 }],
  balls: [
    ...line(0, 6, 0, 14, 3),
    ...line(-1.4, 18, -1.4, 26, 3),
    { x: 0, y: BALL_Y, z: 30 },
    ...line(0, 37, 0, 55, 7),
    ...line(0, 70, 0, 86, 5),
    ...line(-1.4, 96, -1.4, 100, 2),
    ...line(-1.4, 113, -1.4, 117, 2),
    ...line(0, 131, 0, 137, 3),
    ...line(0, 151, 0, 157, 3),
    ...line(0, 170, 0, 175, 2),
    ...hop(0, 182),
    ...line(0, 189, 0, 193, 2),
    ...beachSide.balls,
    ...line(-1.5, 229, 0, 233, 2),
    ...line(0, 237, 0, 239, 2),
    ...hop(0, 244),
    ...line(0, 251, 0, 257, 3),
  ],
  babies: [overJump(0, 144), onTrack(1.6, 105), beachSide.baby],
  finishZ: 262,
  circles: tower([1, 2.6], [5, -2.7], [1, -2.2], [100, 3], [5, -2.7], [1, 2.2]),
}

const candySide = sidePath(1, 226, 252)
const candy: Course = {
  id: 'candy',
  ground: [main(-4, 317), ...candySide.ground],
  holes: [{ x: 0, z: 190, r: 1.5 }],
  spinners: [spinner(92, -1, 2, 7, 0.6)],
  fans: [fan(140, -1, 3)],
  frames: [{ z: 168, x0: -TRACK_HALF, x1: TRACK_HALF }],
  pads: [
    { x: 0, z: 28 },
    { x: -1.5, z: 58 },
    { x: 1.5, z: 114 },
    { x: 0, z: 208 },
    { x: -1.5, z: 268 },
  ],
  slides: [],
  gates: [],
  flags: [{ z: 74 }, { z: 126 }, { z: 156 }, { z: 220 }, { z: 260 }],
  balls: [
    ...line(0, 6, 0, 18, 4),
    ...flight(0, 28),
    ...line(0, 42, 0, 46, 2),
    { x: -0.8, y: BALL_Y, z: 50 },
    ...line(0, 70, 0, 72, 2),
    ...line(0, 84, 0, 100, 5),
    { x: 0.8, y: BALL_Y, z: 106 },
    ...flight(1.5, 114),
    ...line(1.4, 127, 1.4, 131, 2),
    ...line(1.6, 144, 1.6, 148, 2),
    ...line(0, 157, 0, 162, 2),
    ...hop(0, 168),
    ...line(0, 175, 0, 182, 3),
    ...hop(0, 190),
    ...line(0, 197, 0, 200, 2),
    ...flight(0, 208),
    ...candySide.balls,
    ...line(1.5, 254, -1.5, 260, 3),
    ...flight(-1.5, 268),
    ...line(0, 284, 0, 296, 4),
  ],
  babies: [overPad(-1.5, 58), onTrack(-1.6, 135.5), candySide.baby],
  finishZ: 300,
  circles: tower([1, -2.6], [5, 2.7], [100, -3], [1, 2.2], [5, -2.7], [1, 2.2], [5, -2.7]),
}

const winterSide = sidePath(-1, 236, 262)
const winter: Course = {
  id: 'winter',
  ground: [main(-4, 372), ...winterSide.ground],
  holes: [{ x: 0, z: 172, r: 1.5 }],
  spinners: [spinner(92, 1, 2, 7, 0.2)],
  fans: [fan(124, 1, 0.5)],
  frames: [{ z: 210, x0: -TRACK_HALF, x1: TRACK_HALF }],
  pads: [],
  slides: [
    { x0: -TRACK_HALF, x1: TRACK_HALF, z0: 18, z1: 44 },
    { x0: -TRACK_HALF, x1: TRACK_HALF, z0: 140, z1: 158 },
    { x0: -TRACK_HALF, x1: TRACK_HALF, z0: 300, z1: 340 },
  ],
  gates: [
    { z: 60, x0: -TRACK_HALF, x1: TRACK_HALF },
    { z: 192, x0: -TRACK_HALF, x1: TRACK_HALF },
    { z: 284, x0: -TRACK_HALF, x1: TRACK_HALF },
  ],
  flags: [{ z: 74 }, { z: 134 }, { z: 182 }, { z: 228 }, { z: 296 }],
  balls: [
    ...line(0, 6, 0, 14, 3),
    ...line(0, 22, 0, 42, 6),
    ...line(0, 52, 0, 68, 5),
    ...line(0, 84, 0, 100, 5),
    ...line(-1.4, 110, -1.4, 114, 2),
    ...line(-1.4, 128, -1.4, 132, 2),
    ...line(0, 142, 0, 156, 4),
    ...hop(0, 172),
    ...line(0, 181, 0, 185, 2),
    ...line(0, 190, 0, 194, 2),
    ...line(0, 200, 0, 203, 2),
    ...line(0, 217, 0, 222, 2),
    ...winterSide.balls,
    ...line(-1.5, 265, 0, 269, 2),
    ...line(0, 278, 0, 290, 4),
    ...line(-1.2, 304, 1.2, 312, 3),
    ...line(1.2, 318, -1.2, 326, 3),
    ...line(0, 332, 0, 350, 5),
  ],
  babies: [overJump(0, 210), onTrack(1.6, 119.5), winterSide.baby],
  finishZ: 355,
  circles: tower([1, 2.6], [5, -2.7], [100, 3], [5, -2.7], [1, 2.2], [5, -2.7], [100, 3], [1, -2.2]),
}

const nightSide = sidePath(1, 300, 326)
const night: Course = {
  id: 'night',
  ground: [main(-4, 420), ...nightSide.ground],
  holes: [
    { x: 0, z: 100, r: 1.5 },
    { x: 0, z: 284, r: 1.5 },
  ],
  spinners: [spinner(40, -1, 2, 7, 0), spinner(58, 1, 2, 7, 0.25), spinner(346, -1, 2, 6.5, 0.5)],
  fans: [fan(130, -1, 0), fan(148, 1, 2.1), fan(166, -1, 4.2)],
  frames: [
    { z: 84, x0: -TRACK_HALF, x1: TRACK_HALF },
    { z: 264, x0: -TRACK_HALF, x1: TRACK_HALF },
    { z: 368, x0: -TRACK_HALF, x1: TRACK_HALF },
  ],
  pads: [{ x: 0, z: 192 }],
  slides: [{ x0: -TRACK_HALF, x1: TRACK_HALF, z0: 224, z1: 248 }],
  gates: [{ z: 212, x0: -TRACK_HALF, x1: TRACK_HALF }],
  flags: [{ z: 72 }, { z: 112 }, { z: 178 }, { z: 254 }, { z: 296 }, { z: 336 }],
  balls: [
    ...line(0, 6, 0, 18, 4),
    ...line(0, 30, 0, 66, 7),
    ...line(0, 76, 0, 79, 2),
    ...hop(0, 84),
    ...line(0, 91, 0, 94, 2),
    ...hop(0, 100),
    ...line(0, 107, 0, 110, 2),
    ...line(0.8, 117, 1.6, 122, 2),
    ...line(1.6, 126, 1.6, 134, 3),
    ...line(-1.6, 150, -1.6, 153, 2),
    ...line(1.6, 162, 1.6, 170, 3),
    ...line(0, 177, 0, 183, 2),
    ...flight(0, 192),
    ...line(0, 204, 0, 207, 2),
    ...line(0, 229, 0, 243, 3),
    ...line(0, 254, 0, 258, 2),
    ...line(0, 271, 0, 277, 2),
    ...hop(0, 284),
    ...line(0, 291, 0, 294, 2),
    ...nightSide.balls,
    ...line(1.5, 329, 0, 333, 2),
    ...line(0, 339, 0, 353, 3),
    ...hop(0, 368),
    ...line(0, 377, 0, 395, 3),
  ],
  babies: [overJump(0, 264), onTrack(1.6, 143.5), nightSide.baby],
  finishZ: 403,
  circles: tower([1, -2.6], [5, 2.7], [100, -3], [1, 2.2], [5, -2.7], [1, 2.2], [100, -3], [5, 2.7], [1, -2.2]),
}

/** The islands in the order they open. */
export const COURSES: readonly Course[] = [park, beach, candy, winter, night]

if (COURSES.map((c) => c.id).join() !== COURSE_IDS.join()) throw new Error('COURSES must follow COURSE_IDS')

export function courseById(id: CourseId): Course {
  const c = COURSES.find((x) => x.id === id)
  if (!c) throw new Error(`no course ${id}`)
  return c
}
