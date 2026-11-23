/**
 * Magic House's own animator: a player's pose each frame from what the sim says of them (world.ts
 * Player), never from the frames before it, so the same world always draws the same kid. The pose
 * is Silly Billy's (engine/types.ts Pose), put on its rig by scene/rig.ts poseBones.
 *
 * Walking follows the metres walked (Player.stride), so the feet never slide; the moves that happen
 * once (a jump, a landing, a throw, a pick-up) go by how long ago the sim says they happened.
 * From the side a kid turns toward the way it faces only part way, so its face still shows; from
 * high up it turns all the way to its heading, since the camera sees the floor from above.
 * Pure numbers, tested in animate.test.ts.
 */

import { restPose, type Limb, type Mood, type Pose } from '../../../silly-billy/src/engine/types'
import { FEEL } from '../engine/api'
import { smooth } from '../engine/state'
import type { Player, World } from '../engine/world'

export const ANIM = {
  /** Metres walked in one whole walk cycle, two steps, for a kid of size 1. */
  cycle: 1.1,
  /** How far a kid turns from facing the viewer toward the way it goes, radians: enough to show the way, not so far that the face is lost. */
  side: 0.95,
  /** Seconds a landing squashes, a throw swings, a pick-up lifts and a use reaches, and a jump stretches. */
  land: 0.22,
  throw: 0.3,
  grab: 0.25,
  jump: 0.14,
  /** Falling faster than this, m/s, the face is surprised. */
  scared: 9,
  /** Blinks a second while coming back after a fall. */
  blinks: 7,
} as const

/** A kid's look this frame. */
export interface KidPose {
  pose: Pose
  /** The body's turn round y: + toward +x (Silly Billy's yaw), 0 facing the viewer (+z). */
  yaw: number
  /** How big, 1 as built: the world's size of them now (Player.size). */
  scale: number
  mood: Mood
  /** Stars circle the head: bonked. */
  stars: boolean
  /** Drawn this frame: false in the blinks while coming back after a fall. */
  shown: boolean
}

const limb = (l: Limb, swing: number, raise: number, bend: number) => {
  l.swing = swing
  l.raise = raise
  l.bend = bend
}

export function animate(p: Player, t: number, view: World['view']): KidPose {
  const pose = restPose()
  const scale = p.size
  const bonked = t < p.bonkedUntil
  const grounded = p.on !== null
  const holding = p.holding !== null
  const pushing = p.pushing !== null
  let mood: Mood = 'happy'

  if (grounded) {
    // The walk: legs swing opposite each other and the back one bends, arms swing against the legs, the body bobs as the legs pass.
    // How fast they walk on the floor: from the side only x moves (z is 0).
    const amt = Math.min(1.2, Math.hypot(p.velocity[0], p.velocity[2]) / FEEL.walk)
    const phase = (2 * Math.PI * p.stride) / (ANIM.cycle * scale)
    const s = Math.sin(phase)
    limb(pose.legL, 0.65 * amt * s, 0, amt * (0.15 + 0.9 * Math.max(0, -s)))
    limb(pose.legR, -0.65 * amt * s, 0, amt * (0.15 + 0.9 * Math.max(0, s)))
    limb(pose.armL, -0.55 * amt * s, 0.08, 0.2 + 0.3 * amt)
    limb(pose.armR, 0.55 * amt * s, 0.08, 0.2 + 0.3 * amt)
    pose.bob = 0.035 * amt * (1 - Math.abs(s))
    pose.lean = 0.08 * amt
    // Standing still: breathing, the arms hang a little out, the head looks about.
    const idle = Math.max(0, 1 - amt * 3)
    pose.bob += idle * 0.008 * Math.sin(t * 2.2)
    pose.armL.raise += idle * 0.04 * Math.sin(t * 2.2)
    pose.armR.raise += idle * 0.04 * Math.sin(t * 2.2)
    pose.head.turn = idle * 0.2 * Math.sin(t * 0.6)
    pose.head.nod = idle * 0.05 * Math.sin(t * 0.9)
    // Landing: a squash with bent knees, deeper for a harder fall.
    const since = t - p.landedAt
    if (since >= 0 && since < ANIM.land) {
      const k = (1 - since / ANIM.land) * Math.min(0.3, p.landSpeed * 0.025)
      pose.squash = 1 - k
      pose.legL.bend += k * 3
      pose.legR.bend += k * 3
    }
  } else if (p.velocity[1] > 0) {
    // Going up: one knee up, one arm high, as a jump does.
    limb(pose.legL, 0.9, 0, 1.3)
    limb(pose.legR, -0.25, 0, 0.5)
    limb(pose.armR, 2.7, 0.15, 0.2)
    limb(pose.armL, -0.35, 0.45, 0.3)
    const since = t - p.jumpedAt
    if (since >= 0 && since < ANIM.jump) pose.squash = 1 + 0.14 * (1 - since / ANIM.jump)
  } else {
    // Coming down: arms out and flapping a little, legs apart ready to land.
    const flap = 0.2 * Math.sin(t * 14)
    limb(pose.armL, 0.2, 1.25 + flap, 0.2)
    limb(pose.armR, 0.2, 1.25 + flap, 0.2)
    limb(pose.legL, 0.35, 0.12, 0.5)
    limb(pose.legR, -0.15, 0.12, 0.25)
    if (-p.velocity[1] > ANIM.scared) mood = 'surprised'
  }

  if (pushing) {
    // Leaning into it, both arms out in front.
    pose.lean = 0.35
    limb(pose.armL, 1.35, 0.15, 0.35)
    limb(pose.armR, 1.35, 0.15, 0.35)
  }
  const grabbed = t - p.grabbedAt
  if (holding) {
    // Over the head with both hands, lifted there in a moment after the pick-up.
    const up = 1.2 + (Math.PI - 0.35 - 1.2) * smooth(grabbed / ANIM.grab)
    limb(pose.armL, up, 0.25, 0.2)
    limb(pose.armR, up, 0.25, 0.2)
  } else if (!pushing && grabbed >= 0 && grabbed < ANIM.grab) {
    // Using something: a quick reach out in front and back.
    const reach = Math.sin((Math.PI * grabbed) / ANIM.grab)
    limb(pose.armR, 1.5 * reach, 0.1, 0.2)
    limb(pose.armL, 1.2 * reach, 0.1, 0.2)
  }
  const threw = t - p.threwAt
  if (!holding && threw >= 0 && threw < ANIM.throw) {
    // The throw: both arms come down from over the head, fast, and the body follows.
    const k = smooth(threw / ANIM.throw)
    const swing = Math.PI - 0.35 - (Math.PI - 0.35 - 0.9) * k
    limb(pose.armL, swing, 0.2, 0.2)
    limb(pose.armR, swing, 0.2, 0.2)
    pose.lean = 0.25 * Math.sin(Math.PI * k)
  }

  if (bonked) {
    // Bonked: a dizzy wobble, arms flung out, stars round the head.
    mood = 'surprised'
    pose.tilt = 0.18 * Math.sin(t * 11)
    pose.head.tilt = -0.2 * Math.sin(t * 11)
    if (!holding) {
      pose.armL.raise = 0.7
      pose.armR.raise = 0.7
    }
  }

  const back = p.back
  const shown = back === null || t >= back.until || Math.floor((back.until - t) * ANIM.blinks * 2) % 2 === 0
  const yaw = view === 'high' ? Math.atan2(p.heading[0], p.heading[2]) : p.facing * ANIM.side
  return { pose, yaw, scale, mood, stars: bonked, shown }
}
