/**
 * Magic House: a present as made code sees it, and the modelling kit every model in the house is
 * built with (a present, and in a room its decor, its loose things, a solid's model and a button's
 * picture).
 *
 * Types and reference text only, with nothing behind them yet. The reference lines are what the
 * designer model reads; the doc comments are the contract for the engineers. Every line sits in a
 * const that `satisfies Record<keyof X, string>`, so the compiler proves each call has exactly one
 * line and no line names a call that does not exist. The server's prompts (step 4) join the
 * sections of GIFT_REFERENCE, and the room's sections take MODEL_PREAMBLE and the kit lines from
 * here.
 *
 * The kit is Silly Billy's `Kit` (`silly-billy/src/engine/kit.ts`), imported as it is: made code
 * gets a frozen face with only the calls of `ModelKit`. A room's models get it without `anchor`
 * (nothing in a room reads one), and their parts are posed by the room's code; a present's parts
 * are drawn as made, never moved.
 *
 * A present is the body of `function (m, c)`, built round Silly Billy's model kid in one of its
 * slots. Built once, coloured for ever after: the engine runs a present's code once, with
 * `c.main` and `c.second` set to GIFT_MARKERS, and the scene swaps the markers for the wearer's
 * colours (laying the wearer's pattern on the main one) every time it draws it. So the dressing
 * room recolours without running made code again, and the reference tells the model to give c's
 * colours to shapes exactly as given, never mixed, lighter or darker. The trial checks that the
 * markers appear only unmixed (a shape's colour is a marker or no marker's near neighbour).
 *
 * The slot frames are measured on Silly Billy's own kid (`proportions`, KID_HEIGHT, KID_HEAD_R,
 * and where `scene/Actors.tsx` hangs each slot), so they stay true if the rig changes.
 */

import type { Words } from '../../../profiles/src/lang'
import { KID_HEAD_R, KID_HEIGHT, proportions } from '../../../silly-billy/src/engine/body'
import { MAX_SHAPES, type Kit, type ShapeOpts } from '../../../silly-billy/src/engine/kit'
import { SLOTS, type Slot } from '../../../silly-billy/src/engine/types'
import type { RefSection } from './api'
import { cos, sin } from './math'

// ------------------------------------------------------------------------------ the kit

/** What made code may call on Silly Billy's kit, as a frozen face over a real Kit. */
export type ModelKit = Pick<Kit, 'box' | 'sphere' | 'cylinder' | 'cone' | 'torus' | 'capsule' | 'lathe' | 'extrude' | 'tube' | 'part' | 'anchor'>
/** The kit as a room's models see it: no anchors, since nothing in a room reads one. */
export type RoomKit = Omit<ModelKit, 'anchor'>
/** A room's model: the body of `(m) => { ... }`, made code. The same function used again is built once and drawn again. */
export type Model = (m: RoomKit) => void

export const SHAPE_OPTS_REF = {
  at: "at   [x, y, z], its middle (inside a part, measured from the part's pivot); [0, 0, 0] if left out",
  rot: 'rot   [rx, ry, rz], radians, turned round x, then y, then z',
  scale: 'scale   [sx, sy, sz], stretches it along each axis',
  color: "color   '#rrggbb' or a colour name; light grey if left out",
  glow: 'glow   true: it lights itself and shines in the dark',
} as const satisfies Record<keyof ShapeOpts, string>

/** The kit's shapes: the same lines for every model in the house. */
export const KIT_SHAPES_REF = {
  box: 'm.box(w, h, d, opts)   a box: w along x, h along y, d along z',
  sphere: 'm.sphere(r, opts)   a ball of radius r; scale stretches it',
  cylinder: 'm.cylinder(rTop, rBottom, h, opts)   upright along y, h tall; rTop 0 makes a cone',
  cone: 'm.cone(r, h, opts)   upright along y, its point up',
  torus: 'm.torus(r, tube, opts)   a ring of radius r and thickness tube in the x-y plane, its hole along z',
  capsule: 'm.capsule(r, length, opts)   upright along y with round ends; length is its straight middle',
  lathe: 'm.lathe([[r, y], ...], opts)   a round shape turned all the way round the y axis through the points, each r out from the axis at height y',
  extrude: 'm.extrude([[x, y], ...], depth, opts)   a flat outline in x-y made depth thick along z, centred on z',
  tube: 'm.tube([[x, y, z], ...], r, opts)   a bendy tube of radius r through the points',
} as const satisfies Record<Exclude<keyof RoomKit, 'part'>, string>

/** A part in a room's model: the room's code turns it with pose (engine/api.ts SHARED_ACTS_REF). */
export const ROOM_PART_REF = {
  part: "m.part(name, { at, rot }, () => { ... })   the shapes made inside belong to a part named name that pivots at at, turned by rot (their points are measured from the pivot); the room's code turns it with .pose(name, [rx, ry, rz], secs). The same name made again is another copy, posed with it",
} as const satisfies Record<'part', string>

/** A part in a present: drawn as made. Nothing animates a present's parts, so the line promises nothing. */
export const GIFT_PART_REF = {
  part: 'm.part(name, { at, rot }, () => { ... })   the shapes made inside belong to a part that pivots at at, turned by rot (their points are measured from the pivot): a way to place a group of shapes together. It is drawn as made and never moves',
} as const satisfies Record<'part', string>

export const ANCHOR_REF = {
  anchor: "m.anchor('hand', [x, y, z])   where a present worn in the hand is held; its middle if left out. Other names do nothing",
} as const satisfies Record<'anchor', string>

/** The model reference in a room's prompt, before the kit's lines: decor, loose things, a solid's model and a button's picture. */
export const MODEL_PREAMBLE = `MODEL CODE, for decor, loose things, a solid's model and a button's picture: a function (m) => { ... } that builds a model out of shapes with the kit m, below. Metres, y up. A model stands on y = 0 with its middle at x = 0, z = 0 and its front toward +z (the viewer). Make it at its size in the room, beside a player ${KID_HEIGHT} m tall. Write a model function once (const look = (m) => { ... }) and give it to as many things as look alike. At most ${MAX_SHAPES} shapes in one model; past that the rest are left out. It is drawn flat-shaded and low-poly, seen from several metres off: make the shapes that say what it is big and bold, in clear colours.`

// ------------------------------------------------------------------------------ a present

/** The wearer's colours. While the present is built they are GIFT_MARKERS; the scene swaps them for the wearer's own when it draws it. */
export interface GiftColors {
  readonly main: string
  readonly second: string
}

/** The two colours a present is built with. No other code paints with them, and the scene recognises them only exactly. */
export const GIFT_MARKERS: GiftColors = { main: '#fe01fd', second: '#01fdfe' }

/** The most shapes a present may have: it is drawn on up to four players at once and in every column of the dressing room. */
export const GIFT_SHAPES = 120
/** The most words, in each language, in a present's name (engine/api.ts WORDS_MAX holds the room's; this one sits here so the kit's module imports no value from api.ts). */
export const GIFT_WORDS = 3
/** The least a present held in the hand measures, metres, so it reads from far. */
export const HAND_LEAST = 0.4

export const COLORS_REF = {
  main: "c.main   the wearer's first colour; what is painted c.main also carries the wearer's pattern",
  second: "c.second   the wearer's second colour",
} as const satisfies Record<keyof GiftColors, string>

/** A present: the body of `function (m, c)`, compiled behind the guard. It returns nothing. */
export type GiftCode = (m: ModelKit, c: GiftColors) => void

/** The model kid every player is, measured from Silly Billy's own rig. */
const KID = proportions({ body: 'kid', height: KID_HEIGHT, build: 1 })
const R = KID_HEAD_R
/** A measurement as the reference says it: two decimals. */
const cm = (v: number) => String(Math.round(v * 100) / 100)

/**
 * A point on the model kid's face, from the middle of the head, a little out from the skin: `around`
 * radians round from the front (side -1 the kid's right, 1 its left) and `up` radians up, as Silly
 * Billy's face puts its eyes and brows (scene/face.ts PERSON).
 */
export function facePoint(side: -1 | 1, around: number, up: number): readonly [number, number, number] {
  const r = R * 1.02
  return [side * sin(around) * cos(up) * r, sin(up) * r, cos(around) * cos(up) * r]
}

/** Each eye's middle, sides, top and bottom, and the brow over it, as [around, up] (facePoint). */
export const EYE_SPOTS: readonly (readonly [number, number])[] = [
  [0.33, 0.2],
  [0.45, 0.2],
  [0.22, 0.2],
  [0.33, 0.06],
  [0.33, 0.33],
]
export const BROW_SPOT = [0.33, 0.47] as const
const EYE = facePoint(1, EYE_SPOTS[0]![0], EYE_SPOTS[0]![1])

/**
 * What a present leaves free of the face, from the middle of the head, as SLOT_REF says it and
 * trial/giftCheck.ts checks it: hair and a head piece leave nothing in front of the face across x
 * -x to x and y from y0 to y1 (hair the face, a head piece the eyes); a piece worn on the face leaves
 * the middle of each eye seen from the front.
 */
export const FACE_FREE = {
  hair: { x: R * 0.6, y0: -R * 0.65, y1: R * 0.35 },
  head: { x: R * 0.6, y0: 0, y1: R * 0.35 },
  eye: { x: EYE[0], y: EYE[1] },
} as const

/** Where each slot's origin is on the model kid, and what it covers. Measured, never typed: the head's middle, the feet, between the shoulder blades, the hand's anchor. */
export const SLOT_REF = {
  hair: `hair   the origin is the middle of the head, a ball of radius ${cm(R)} (its top at y ${cm(R)}), the face toward +z. Hair covers the top, the sides and the back of the head and leaves the face free: nothing in front of the face between x ${cm(-FACE_FREE.hair.x)} and ${cm(FACE_FREE.hair.x)} and y ${cm(FACE_FREE.hair.y0)} and ${cm(FACE_FREE.hair.y1)}`,
  head: `head   the origin as for hair. Worn on the head over any hair, which reaches about ${cm(R * 1.17)} from the middle; the eyes stay free: nothing in front of the face between x ${cm(-FACE_FREE.head.x)} and ${cm(FACE_FREE.head.x)} and y ${cm(FACE_FREE.head.y0)} and ${cm(FACE_FREE.head.y1)}`,
  face: `face   the origin as for hair. Worn on the front of the face, about z ${cm(R * 1.04)}; the eyes stay seen: nothing in front of the middle of each eye (x ${cm(-FACE_FREE.eye.x)} and ${cm(FACE_FREE.eye.x)}, y ${cm(FACE_FREE.eye.y)})`,
  body: `body   the origin is between the feet: the hips at y ${cm(KID.hipY)}, the shoulders at y ${cm(KID.shoulderY)} and ${cm(KID.shoulderX * 2)} apart, the neck at y ${cm(KID.neckY)}, the body ${cm(KID.torsoW)} wide and ${cm(KID.torsoD)} deep, the arms ${cm(KID.upperArm + KID.lowerArm)} long hanging at the sides. Worn round the body, close to it`,
  back: `back   the origin is between the shoulder blades, ${cm(KID.shoulderY - 0.05)} m above the feet, on the back, which faces -z: it reaches out toward -z`,
  hand: `hand   built upright along y, its front toward +z, and held so in the right hand: m.anchor('hand', [x, y, z]) names the point of it that sits in the fist (its middle if left out), and the rest stays round that point as built. About twice its real size and at least ${HAND_LEAST} m, so it reads from far`,
} as const satisfies Record<Slot, string>

export const GIFT_PREAMBLE = `PRESENT CODE: the body of  function (m, c) { ... }
A present is something a child wears. Build it with the kit m round a model child ${KID_HEIGHT} m tall, for the one slot the answer names before the code, and for that slot only. Metres, y up, the child faces +z; where the origin is depends on the slot (below). Its name comes from the answer too: the code gives no words.
c holds the wearer's two colours. Give them to shapes exactly as they are, never mixed, lighter or darker: the wearer picks their colours and pattern in the dressing room, and those shapes follow. A shape in any other colour keeps it whatever the wearer picks, so keep other colours to small details.
Model its real form in its true proportions: round where it is round, curved where it curves, thin parts thin; a box only for what really is a block. It is seen from a few metres off, mostly from the side and the front: make the shapes that say what it is clear and bold. Nothing reaches into the face but what is worn on the face. At most ${GIFT_SHAPES} shapes.
Plain JavaScript: no imports. It returns nothing. Math.random() gives the same throws every time it is built.`

// ------------------------------------------------------------------------------ the answer

/** One present, its fields in this order: what it is and where it goes, its form in words, then its code. */
export interface GiftAnswer {
  name: Words
  slot: Slot
  form: string
  code: string
}

export const GIFT_ANSWER_REF = {
  name: `Its name, { en, fi }, at most ${GIFT_WORDS} plain words in each, no dashes.`,
  slot: `The slot it is worn in: ${SLOTS.join(', ')}.`,
  form: 'Before its code, in a sentence or two: its real form, its main masses and how they join, what is round, curved, tapered or thin, its size against the child.',
  code: 'Present code: the body of function (m, c), no header.',
} as const satisfies Record<keyof GiftAnswer, string>

/** The second, smaller call after a room has passed: its four presents. */
export interface GiftsAnswer {
  gifts: GiftAnswer[]
}

/** How many presents a room has: each player gets one they do not own, else one from another room. */
export const GIFTS_PER_ROOM = 4

export const GIFTS_ANSWER_REF = {
  gifts: `${GIFTS_PER_ROOM} presents that belong to this room, each a different thing, in at least three different slots.`,
} as const satisfies Record<keyof GiftsAnswer, string>

/** The present's whole reference, in order: the preamble, then these sections. */
export const GIFT_REFERENCE: readonly RefSection[] = [
  { title: 'c, the colours:', lines: COLORS_REF },
  { title: 'The slots:', lines: SLOT_REF },
  { title: 'm, the kit:', lines: { ...KIT_SHAPES_REF, ...GIFT_PART_REF, ...ANCHOR_REF } },
  { title: 'Every shape takes opts { at, rot, scale, color, glow }, each optional:', lines: SHAPE_OPTS_REF },
]
