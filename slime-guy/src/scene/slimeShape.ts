import type { Slot } from '../game/closet'

/**
 * The slime's body as numbers, for a body of radius 1 whose bottom is at y = 0 and centre
 * at y = 1, facing +Z (so its own left is +X): where the eyes, mouth, arms, neck, shirt
 * and skirt sit, and the Pose its owner fills every frame for the body and its clothes to
 * read. Slime.tsx draws the body, Clothes.tsx what it wears.
 */

/** The eyes: centres EYE.x either side of the middle in a frame EYE.y up and EYE.z forward, each EYE.r round. The frame follows the body; the glasses sit in it. */
export const EYE = { x: 0.55, y: 1.65, z: 0.58, r: 0.4 } as const
/** The shoulders the arms hang from, and the arm's length from the shoulder to the middle of the hand. */
export const ARM = { x: 0.95, y: 0.82, len: 0.36 } as const
/** The middle of the mouth, on the front of the body. */
export const MOUTH = { y: 1.2, z: 0.98 } as const
/** The middle of a hat on top of the head, behind the eyes: what it spins about when it flies off. */
export const HAT = { y: 1.95, z: -0.1 } as const
/** The neck line (scarves, pearls, bow ties). */
export const NECK_Y = 0.96
/** A shirt's band, from its hem up to its collar. */
export const SHIRT = { lo: 0.45, hi: 1.04 } as const
/** A skirt's waist, just under the shirt's hem. */
export const SKIRT_Y = 0.44

/** The body's radius at height y. */
export const girth = (y: number) => Math.sqrt(Math.max(0, 1 - (y - 1) * (y - 1)))

/**
 * Where a flat thing sits on the body's surface toward (x, y, z) from its centre, `lift`
 * out from it, facing out and turned `spin` within the surface: a position and a
 * rotation (yaw, then pitch, then the spin) to spread onto a mesh.
 */
export function onBody(x: number, y: number, z: number, lift: number, spin: number) {
  const len = Math.hypot(x, y, z)
  const out = 1 + lift
  return {
    position: [(x / len) * out, 1 + (y / len) * out, (z / len) * out] as [number, number, number],
    rotation: [-Math.asin(y / len), Math.atan2(x, z), spin, 'YXZ'] as [number, number, number, 'YXZ'],
  }
}

/**
 * What one slime does this frame. Its owner (the player, an idle slime, a baby) fills the
 * first part every frame from the run or its clock; the body turns it into the jelly's
 * shape, the face and the arms, and writes the last part back for its clothes, which
 * read the same object in their own frame callbacks after it. Angles are radians,
 * lengths body units.
 */
export interface Pose {
  /** Seconds on the owner's clock, for what loops: the twinkle, the fish's flop, the scarf's flutter. */
  t: number
  /** The jelly's height as a share of round: over 1 stretched, under 1 squashed; it gets thinner or fatter to keep its size. */
  stretch: number
  /** 0 standing to 1 flat as a puddle `flat` tall and `spread` times as wide as round, with the eyes shrunk to `peek` of their size so only they look over the top. */
  hidden: number
  flat: number
  spread: number
  peek: number
  /** The jelly sloshing about its bottom: to its left and forward. */
  roll: number
  tip: number
  /** Where the pupils point, -1 to 1 toward its left and up; `dizzy` 0 to 1 sends them round in circles; `scared` 0 to 1 opens the eyes wide and shrinks the pupils. */
  lookX: number
  lookY: number
  dizzy: number
  scared: number
  /** 0 open to 1 shut. */
  blink: number
  /** The mouth: 0 the smile to 1 wide open; `round` 0 to 1 an O (a burp, a sneeze, a fright). */
  open: number
  round: number
  /** Each arm, [its left, its right]: lifted from hanging down (0) out to the side (pi / 2) to straight up (pi), and swung forward. */
  lift: [number, number]
  swing: [number, number]
  /** Seconds since the sneeze's choo, since the burp and since the little fish landed on its head; -1 for none. */
  sneeze: number
  burp: number
  fish: number
  /** The clothes' own motion: the skirt's turn and flare (0 to 1), the bags' swing, the backpack's hop, the hat flying off (0 on, 1 high) and its spin, and how hard the air rushes past (0 to 1, the scarf). */
  twirl: number
  flare: number
  sway: number
  bounce: number
  hatUp: number
  hatSpin: number
  flutter: number
  /** The place whose new thing from the box just went on, and how big it is as it boings on (1 at rest). */
  giftSlot: Slot | null
  giftOn: number
  /** Written by the body: the clothes' scale (the jelly's, and pulled in when flat), the eyes' frame (height, depth, size) and the right hand's middle, the hand in the clothes' own (scaled) frame. */
  sx: number
  sy: number
  sz: number
  eyeY: number
  eyeZ: number
  eyeS: number
  handX: number
  handY: number
  handZ: number
}

/**
 * The middle of a hand: its arm hangs from the shoulder at (x, y, 0), lifted out by
 * `lift` and swung forward by `swing`, `scale` times its full length. The arm turns
 * about z first and x second, as its group does. Writes into `out`.
 */
export function handAt(out: { x: number; y: number; z: number }, side: 1 | -1, lift: number, swing: number, x: number, y: number, scale: number) {
  const a = side * lift
  const reach = ARM.len * scale
  out.x = x + reach * Math.sin(a)
  out.y = y - reach * Math.cos(a) * Math.cos(swing)
  out.z = reach * Math.cos(a) * Math.sin(swing)
}

/** The owner's half of a pose back at rest: round, awake, arms hanging a little out. The body's half is left as it is. */
export function restPose(p: Pose) {
  p.stretch = 1
  p.hidden = 0
  p.flat = 0.8
  p.spread = 1.45
  p.peek = 1
  p.roll = 0
  p.tip = 0
  p.lookX = 0
  p.lookY = 0
  p.dizzy = 0
  p.scared = 0
  p.blink = 0
  p.open = 0
  p.round = 0
  p.lift[0] = 0.3
  p.lift[1] = 0.3
  p.swing[0] = 0
  p.swing[1] = 0
  p.sneeze = -1
  p.burp = -1
  p.fish = -1
  p.twirl = 0
  p.flare = 0
  p.sway = 0
  p.bounce = 0
  p.hatUp = 0
  p.hatSpin = 0
  p.flutter = 0
  p.giftSlot = null
  p.giftOn = 1
}

/** A pose at rest with the body's half filled in for a round slime, so clothes drawn alone (the gift) sit where they would on it. */
export function newPose(): Pose {
  const hand = { x: 0, y: 0, z: 0 }
  handAt(hand, -1, 0.3, 0, -ARM.x, ARM.y, 1)
  const p: Pose = {
    t: 0,
    stretch: 1,
    hidden: 0,
    flat: 0.8,
    spread: 1.45,
    peek: 1,
    roll: 0,
    tip: 0,
    lookX: 0,
    lookY: 0,
    dizzy: 0,
    scared: 0,
    blink: 0,
    open: 0,
    round: 0,
    lift: [0.3, 0.3],
    swing: [0, 0],
    sneeze: -1,
    burp: -1,
    fish: -1,
    twirl: 0,
    flare: 0,
    sway: 0,
    bounce: 0,
    hatUp: 0,
    hatSpin: 0,
    flutter: 0,
    giftSlot: null,
    giftOn: 1,
    sx: 1,
    sy: 1,
    sz: 1,
    eyeY: EYE.y,
    eyeZ: EYE.z,
    eyeS: 1,
    handX: hand.x,
    handY: hand.y,
    handZ: hand.z,
  }
  return p
}
