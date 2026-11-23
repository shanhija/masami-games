/**
 * Magic House: the check of a room's presents (protocol.ts GiftsJob) into a GiftsReport, by
 * engine/gift.ts. Each present is compiled from its guarded code (trial/compile.ts) and built once
 * with c as the two GIFT_MARKERS, as the scene builds it; then it must have at most GIFT_SHAPES
 * shapes, stay inside its slot's frame on Silly Billy's model kid (SLOT_FRAMES), leave the face
 * as its slot's line says (engine/gift.ts FACE_FREE: hair the face, a head piece the eyes, a piece
 * on the face the middle of each eye, all seen from the front), measure at least
 * HAND_LEAST when it is held in the hand, paint something c.main, give the markers only unmixed
 * (the scene swaps a marker only where a shape's colour is exactly it, scene/dress.ts inColours,
 * so a colour near a marker but not it would stay a marker's neon on every wearer), and have a name
 * of at most GIFT_WORDS words in each language. Each fault is a plain sentence (GIFT_MISTAKES, or
 * the engine's MISTAKES for a misread kit or name) with the designer's line where there is one.
 * A present that fails is dropped; there is no fix round for presents (protocol.ts GiftsReport).
 *
 * The page's worker imports this too, so nothing under it reaches a .tsx file.
 */

import { apply, eulerXYZ, KID_HEAD_R, KID_HEIGHT, proportions, type Mat3 } from '../../../silly-billy/src/engine/body'
import { boundsOf, buildRecipe, MAX_SHAPES, partTransform } from '../../../silly-billy/src/engine/kit'
import { describeError, GuardError } from '../../../silly-billy/src/engine/sandbox'
import { SLOTS, type Recipe, type Shape, type Slot, type Vec3 } from '../../../silly-billy/src/engine/types'
import { MISTAKES } from '../engine/api'
import { explain, Mistake, words } from '../engine/checks'
import { EYE_SPOTS, FACE_FREE, facePoint, GIFT_MARKERS, GIFT_SHAPES, GIFT_WORDS, HAND_LEAST, type GiftColors } from '../engine/gift'
import type { GiftsJob, GiftsReport, GiftTry } from '../protocol'
import { compileGift, type GiftBuild } from './compile'

/** The model kid every player is, measured from Silly Billy's own rig (as engine/gift.ts SLOT_REF reads it). */
const KID = proportions({ body: 'kid', height: KID_HEIGHT, build: 1 })

/** A box round a slot's origin, metres, and the origin in words for a sentence. */
export interface SlotFrame {
  readonly min: Vec3
  readonly max: Vec3
  readonly origin: string
}

/**
 * Where a present may reach, by slot, from the slot's origin as engine/gift.ts SLOT_REF puts it.
 * Generous round numbers about the model kid (a head of radius 0.23, shoulders at 0.68, the neck at
 * 0.72): a present that fits its slot passes, one far too big or worn in the wrong place does not.
 * Every piece of the starting wardrobe fits its own (a test holds it). Hair stays out of the face
 * (z at most 0.35 in front of the head's middle); the back reaches down to the ground; a present
 * held in the hand is measured from the point held in the fist.
 */
export const SLOT_FRAMES: Readonly<Record<Slot, SlotFrame>> = {
  hair: { min: [-0.6, -0.7, -0.6], max: [0.6, 0.6, 0.35], origin: 'the middle of the head' },
  head: { min: [-0.6, -0.3, -0.6], max: [0.6, 0.9, 0.6], origin: 'the middle of the head' },
  face: { min: [-0.4, -0.4, -0.3], max: [0.4, 0.35, 0.5], origin: 'the middle of the head' },
  body: { min: [-0.5, -0.05, -0.35], max: [0.5, KID.neckY + 0.15, 0.35], origin: 'between the feet' },
  back: { min: [-0.7, -(KID.shoulderY - 0.05), -0.8], max: [0.7, 0.6, 0.25], origin: 'between the shoulder blades' },
  hand: { min: [-0.7, -0.7, -0.7], max: [0.7, 1.4, 0.7], origin: 'the point held in the fist' },
}

/** Two decimals, as a sentence gives a measure. */
const cm = (v: number) => String(Math.round(v * 100) / 100)
const AXES = ['x', 'y', 'z'] as const

/** What the check says back about a present. */
export const GIFT_MISTAKES = {
  notSlot: (got: string) => `the present's slot is ${got}, but a slot is one of ${SLOTS.join(', ')}`,
  notCompiled: (said: string) => `the present's code does not compile: ${said}`,
  thrown: (said: string) => `the present's code threw: ${said}`,
  tooManyShapes: (count: string) => `the present has ${count} shapes, and a present has at most ${GIFT_SHAPES}: build it with fewer, bigger shapes`,
  outside: (slot: Slot, over: string) => {
    const f = SLOT_FRAMES[slot]
    const range = AXES.map((a, i) => `${a} ${cm(f.min[i]!)} to ${cm(f.max[i]!)}`).join(', ')
    return `worn as ${slot}, the present reaches ${over} from ${f.origin}: it must stay within ${range} of it`
  },
  handSmall: (longest: number) => `the present measures ${cm(longest)} m at its longest, and held in the hand it must be at least ${HAND_LEAST} m so it reads from far: make it bigger`,
  faceCovered: (slot: 'hair' | 'head') => {
    const f = FACE_FREE[slot]
    return `worn as ${slot}, the present covers the ${slot === 'hair' ? 'face' : 'eyes'}: nothing may be in front of the face between x ${cm(-f.x)} and ${cm(f.x)} and y ${cm(f.y0)} and ${cm(f.y1)} from the middle of the head`
  },
  eyesHidden: () => `worn on the face, the present hides the eyes: nothing may be in front of the middle of each eye, at x ${cm(-FACE_FREE.eye.x)} and ${cm(FACE_FREE.eye.x)}, y ${cm(FACE_FREE.eye.y)} from the middle of the head`,
  noMain: () => "no shape is painted c.main, so the wearer's colours never show: give c.main to the shapes that say what it is",
  mixed: (colour: string, which: keyof GiftColors) =>
    `a shape is painted ${colour}, close to c.${which} but not it: give c.main and c.second to shapes exactly as they are, never mixed, lighter or darker, and paint the rest in colours far from them`,
} as const

// ------------------------------------------------------------------------------ building a present

/**
 * A present built once as the scene builds it: its code run in a fresh kit with c as the markers,
 * worn in `slot`. Held in the hand, the point in the fist is the middle of its shapes unless its
 * code named one with m.anchor('hand', ...) (engine/gift.ts SLOT_REF hand). Throws what its code
 * throws, and MISTAKES.noShapes when it made none.
 */
export function giftRecipe(build: GiftBuild, slot: Slot): { recipe: Recipe; notes: string[] } {
  return buildRecipe((kit) => {
    build(kit)
    if (kit.shapes.length === 0) throw new Mistake(MISTAKES.noShapes('the present'))
    if (slot === 'hand' && kit.anchors.hand === undefined) {
      const b = boundsOf(kit.shapes, kit.parts)
      kit.anchor('hand', [0, 1, 2].map((i) => (b.min[i]! + b.max[i]!) / 2))
    }
    return { carry: 'hand', wear: slot, solid: false }
  }, [])
}

/** Where a recipe's anchor is in the model's own frame. */
function anchorAt(recipe: Recipe, name: string): Vec3 {
  const a = recipe.anchors[name]
  if (a === undefined) throw new Error(`the present has no ${name} anchor`)
  const frame = partTransform(recipe.parts, a.part)
  const o = apply(frame.r, a.at)
  return [frame.p[0] + o[0], frame.p[1] + o[1], frame.p[2] + o[2]]
}

/** A colour given as '#rrggbb': its hue in degrees and its saturation, 0 to 1 (the line's drift log reads walls' hues by it too, server/line.ts drift). */
export function hueOf(hex: string): { readonly hue: number; readonly sat: number } {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number]
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  if (d === 0) return { hue: 0, sat: 0 }
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { hue: h * 60, sat: d / max }
}

/** How near a colour's hue must be to a marker's, degrees, and how strong it must be, to be the marker mixed: lighter, darker or greyer keeps a marker's hue. */
const HUE_NEAR = 2
const SAT_LEAST = 0.5

/** The marker a colour is a near neighbour of without being it, or null: the same hue, strong enough to read as it. */
export function nearMarker(colour: string): keyof GiftColors | null {
  const c = hueOf(colour)
  if (c.sat < SAT_LEAST) return null
  for (const which of ['main', 'second'] as const) {
    if (colour === GIFT_MARKERS[which]) return null
    const m = hueOf(GIFT_MARKERS[which])
    const apart = Math.abs(c.hue - m.hue)
    if (Math.min(apart, 360 - apart) <= HUE_NEAR) return which
  }
  return null
}

// ------------------------------------------------------------------------------ what covers the face

/** The transpose of a rotation: the turn back. */
const back = (m: Mat3): Mat3 => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]

/** A length from its parts, by sqrt alone (no native transcendental Math in a check). */
const len = (...v: number[]) => Math.sqrt(v.reduce((n, x) => n + x * x, 0))

/** How far a point is from the segment a to b. */
function toSegment(p: readonly number[], a: readonly number[], b: readonly number[]): number {
  const d = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!]
  const dd = d[0]! * d[0]! + d[1]! * d[1]! + d[2]! * d[2]!
  const t = dd === 0 ? 0 : Math.max(0, Math.min(1, ((p[0]! - a[0]!) * d[0]! + (p[1]! - a[1]!) * d[1]! + (p[2]! - a[2]!) * d[2]!) / dd))
  return len(p[0]! - a[0]! - t * d[0]!, p[1]! - a[1]! - t * d[1]!, p[2]! - a[2]! - t * d[2]!)
}

/** Whether a point in a shape's own frame (before its scale) is inside it: exact for every kind, a lathe filled to its widest at each height. */
function inside(s: Shape, q: Vec3): boolean {
  const [a = 0.1, b = 0.1, c = 0.1] = s.dims
  const pts = s.points ?? []
  switch (s.kind) {
    case 'box':
      return Math.abs(q[0]) < a / 2 && Math.abs(q[1]) < b / 2 && Math.abs(q[2]) < c / 2
    case 'sphere':
      return len(q[0], q[1], q[2]) < a
    case 'cylinder':
      return Math.abs(q[1]) < c / 2 && len(q[0], q[2]) < Math.max(a, b)
    case 'torus':
      return len(len(q[0], q[1]) - a, q[2]) < b
    case 'capsule':
      return toSegment(q, [0, -b / 2, 0], [0, b / 2, 0]) < a
    case 'lathe': {
      // The widest the profile is at this height.
      const r = len(q[0], q[2])
      for (let i = 1; i < pts.length; i++) {
        const [r0, y0] = pts[i - 1] as [number, number]
        const [r1, y1] = pts[i] as [number, number]
        if ((q[1] - y0) * (q[1] - y1) > 0 || y0 === y1) continue
        if (r < r0 + ((q[1] - y0) / (y1 - y0)) * (r1 - r0)) return true
      }
      return false
    }
    case 'extrude': {
      if (Math.abs(q[2]) >= a / 2) return false
      // Inside the outline: an odd number of its edges cross the line to the right of the point.
      let odd = false
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i] as [number, number]
        const [xj, yj] = pts[j] as [number, number]
        if (yi > q[1] !== yj > q[1] && q[0] < ((xj - xi) * (q[1] - yi)) / (yj - yi) + xi) odd = !odd
      }
      return odd
    }
    case 'tube':
      return pts.some((p, i) => i > 0 && toSegment(q, pts[i - 1]!, p) < a)
  }
}

/** Whether anything of a recipe covers a point, in the model's own frame. Each shape's turn is worked out once. */
export function coverTest(recipe: Recipe): (p: Vec3) => boolean {
  const shapes = recipe.shapes.map((s) => {
    const frame = partTransform(recipe.parts, s.part)
    return { s, at: frame.p, part: back(frame.r), own: back(eulerXYZ(s.rot[0], s.rot[1], s.rot[2])) }
  })
  return (p) =>
    shapes.some(({ s, at, part, own }) => {
      // The point in the shape's own frame: undo the part's move and turn, then the shape's, then its scale.
      const inPart = apply(part, [p[0] - at[0], p[1] - at[1], p[2] - at[2]])
      const q = apply(own, [inPart[0] - s.at[0], inPart[1] - s.at[1], inPart[2] - s.at[2]])
      return inside(s, [q[0] / s.scale[0], q[1] / s.scale[1], q[2] / s.scale[2]])
    })
}

/** The step between the points a face check looks at, metres. */
const FACE_STEP = 0.01

/** Whether anything covers the face seen from the front across x -x to x and y y0 to y1: every point in front of the head's ball there, out to `far`. */
function faceCovered(covered: (p: Vec3) => boolean, x: number, y0: number, y1: number, far: number): boolean {
  for (let px = -x + FACE_STEP / 2; px < x; px += FACE_STEP) {
    for (let py = y0 + FACE_STEP / 2; py < y1; py += FACE_STEP) {
      for (let pz = Math.sqrt(Math.max(0, KID_HEAD_R * KID_HEAD_R - px * px - py * py)) + FACE_STEP / 2; pz < far; pz += FACE_STEP) if (covered([px, py, pz])) return true
    }
  }
  return false
}

/** Whether a point on the face is seen from the front: nothing covers the line from it out to `far`. */
function seen(covered: (p: Vec3) => boolean, at: readonly [number, number, number], far: number): boolean {
  for (let z = at[2]; z < far; z += FACE_STEP / 2) if (covered([at[0], at[1], z])) return false
  return true
}

// ------------------------------------------------------------------------------ the check

/** What is wrong with a present as built, worn in `slot`: its shapes, its frame, its size in the hand and its colours (none when it is right). */
export function measureGift(recipe: Recipe, slot: Slot): string[] {
  const faults: string[] = []

  // The kit keeps at most MAX_SHAPES and notes the rest: past it the count is only "at least".
  const count = recipe.shapes.length
  if (count > GIFT_SHAPES) faults.push(GIFT_MISTAKES.tooManyShapes(count >= MAX_SHAPES ? `more than ${MAX_SHAPES}` : String(count)))

  const frame = SLOT_FRAMES[slot]
  const from = slot === 'hand' ? anchorAt(recipe, 'hand') : ([0, 0, 0] as Vec3)
  const over: string[] = []
  for (const [i, axis] of AXES.entries()) {
    const lo = recipe.bounds.min[i]! - from[i]!
    const hi = recipe.bounds.max[i]! - from[i]!
    if (lo < frame.min[i]!) over.push(`${axis} ${cm(lo)}`)
    if (hi > frame.max[i]!) over.push(`${axis} ${cm(hi)}`)
  }
  if (over.length > 0) faults.push(GIFT_MISTAKES.outside(slot, over.join(' and ')))

  // The face, as the slot's line says it stays free, seen from the front.
  const covered = coverTest(recipe)
  if (slot === 'hair' || slot === 'head') {
    const f = FACE_FREE[slot]
    if (faceCovered(covered, f.x, f.y0, f.y1, frame.max[2])) faults.push(GIFT_MISTAKES.faceCovered(slot))
  }
  if (slot === 'face') {
    const eyes = ([-1, 1] as const).map((side) => facePoint(side, EYE_SPOTS[0]![0], EYE_SPOTS[0]![1]))
    if (eyes.some((e) => !seen(covered, e, frame.max[2]))) faults.push(GIFT_MISTAKES.eyesHidden())
  }

  if (slot === 'hand') {
    const longest = Math.max(...AXES.map((_, i) => recipe.bounds.max[i]! - recipe.bounds.min[i]!))
    if (longest < HAND_LEAST) faults.push(GIFT_MISTAKES.handSmall(longest))
  }

  if (!recipe.shapes.some((s) => s.color === GIFT_MARKERS.main)) faults.push(GIFT_MISTAKES.noMain())
  const mixed = new Set<string>()
  for (const s of recipe.shapes) {
    const which = nearMarker(s.color)
    if (which !== null && !mixed.has(s.color)) {
      mixed.add(s.color)
      faults.push(GIFT_MISTAKES.mixed(s.color, which))
    }
  }
  return faults
}

/** One present's check: passed when it has no sentence. */
export interface GiftCheck {
  readonly passed: boolean
  readonly sentences: readonly string[]
}

/** Checks one present Opus wrote: its name, then its code compiled, built once, and measured. */
export function checkGift(gift: GiftTry): GiftCheck {
  const sentences: string[] = []
  const done = (): GiftCheck => ({ passed: sentences.length === 0, sentences })
  try {
    words("the present's name", gift.name, GIFT_WORDS)
  } catch (err) {
    if (!(err instanceof Mistake)) throw err
    sentences.push(err.message)
  }
  if (!SLOTS.includes(gift.slot)) {
    sentences.push(GIFT_MISTAKES.notSlot(JSON.stringify(gift.slot)))
    return done()
  }
  let build: GiftBuild
  try {
    build = compileGift(gift.code)
  } catch (err) {
    sentences.push(GIFT_MISTAKES.notCompiled(describeError(err)))
    return done()
  }
  let made: { recipe: Recipe }
  try {
    made = giftRecipe(build, gift.slot)
  } catch (err) {
    sentences.push(err instanceof Mistake || err instanceof GuardError ? explain(null, err) : GIFT_MISTAKES.thrown(describeError(err)))
    return done()
  }
  sentences.push(...measureGift(made.recipe, gift.slot))
  return done()
}

/** Checks a room's presents, in the job's order. */
export function checkGifts(job: GiftsJob): GiftsReport {
  return { room: job.room, checks: job.gifts.map(checkGift) }
}
