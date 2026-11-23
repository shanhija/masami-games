/**
 * The starting wardrobe's fourteen pieces: what a gallery face's hair and extra become on the
 * house's kid. Five come from Silly Billy's content/items/people.ts by import (short, curly and
 * pigtail hair, the cap, the glasses); the other nine are built here with its kit.
 *
 * Every piece is built round Silly Billy's model kid as people.ts builds its own: the origin is the
 * middle of the head, a ball of radius 0.23 (KID_HEAD_R), the face toward +z. The house sees a kid
 * from the side, turned 0.95 rad toward the viewer, and a little from above, so nothing comes in
 * front of the eyes and brows: hair stays above y 0.12 at the front and its sides stay behind the
 * cheeks, and what sits on the head sits on top of it or at its side.
 *
 * Every piece is built in the two marker colours (engine/gift.ts GIFT_MARKERS), so the scene paints
 * it its wearer's colours (scene/dress.ts inColours): hair is main, so it takes the avatar's hair
 * colour, and a hair tie is second. The imported pieces are painted in Silly Billy's own colours,
 * so theirs are swapped for the markers here, exactly.
 */

import { KID_HEAD_R } from '../../../../silly-billy/src/engine/body'
import { boundsOf, buildRecipe, parseColor, type Kit } from '../../../../silly-billy/src/engine/kit'
import { namesOf } from '../../../../silly-billy/src/engine/library'
import type { Recipe, Slot, Vec3 } from '../../../../silly-billy/src/engine/types'
import { PEOPLE_ITEMS } from '../../../../silly-billy/src/content/items/people'
import { alongY, spread } from '../../../../silly-billy/src/content/items/shapes'
import { GIFT_MARKERS, type GiftColors } from '../../engine/gift'

export type PieceName =
  | 'hair-short'
  | 'hair-long'
  | 'hair-bob'
  | 'hair-pigtails'
  | 'hair-bun'
  | 'hair-curly'
  | 'hair-spiky'
  | 'cat-ears'
  | 'bunny-ears'
  | 'crown'
  | 'bow'
  | 'cap'
  | 'glasses'
  | 'flower'

/** One piece: the slot it is worn in, how it is built (in GIFT_MARKERS) and the colours it comes in. */
export interface Piece {
  readonly slot: Slot
  /** Its model in the marker colours, with the kit's notes (none, for a piece that builds right). */
  readonly make: () => { recipe: Recipe; notes: string[] }
  /** The colours it is worn in when the gallery face gives it: `hair` is the face's hair colour. */
  readonly colours: (hair: string) => GiftColors
}

const { main: MAIN, second: SECOND } = GIFT_MARKERS
const R = KID_HEAD_R

/** The pink of a hair tie, Silly Billy's own (people.ts ties its hair in it). */
export const TIE = parseColor('hotpink')!
const EAR_PINK = '#ff9fbf'
const GOLD = '#ffd23f'
const GEM_RED = '#ff5d7a'
const GEM_BLUE = '#4cc9e0'
const BOW_PINK = '#ff5d9e'
const KNOT_PINK = '#ff86b8'
const PETAL = '#ffffff'
const MIDDLE = '#ffd23f'
const LEAF = '#4cc26a'

/** Hair: the face's hair colour, its tie Silly Billy's pink. */
const hairColours = (hair: string): GiftColors => ({ main: hair, second: TIE })
/** A piece's own two colours, whatever the hair. */
const own = (main: string, second: string) => (): GiftColors => ({ main, second })

// ------------------------------------------------------------------------------ the five from Silly Billy

/** A people.ts item rebuilt with its colours swapped for the markers: each colour named in `marks` (Silly Billy's colour names) becomes that marker; the rest keep theirs. `lift` raises it, metres. */
function imported(id: string, marks: Readonly<Record<string, keyof GiftColors>>, lift: number): Piece['make'] {
  return () => {
    const item = PEOPLE_ITEMS.find((i) => i.id === id)
    if (item === undefined) throw new Error(`Silly Billy has no ${id} in people.ts`)
    const { recipe, notes } = buildRecipe(item.build, namesOf(item))
    const swap = new Map(Object.entries(marks).map(([name, marker]) => [parseColor(name), GIFT_MARKERS[marker]]))
    const shapes = recipe.shapes.map((s) => ({ ...s, at: [s.at[0], s.at[1] + lift, s.at[2]] as Vec3, color: swap.get(s.color) ?? s.color }))
    return { recipe: { ...recipe, shapes, bounds: boundsOf(shapes, recipe.parts) }, notes }
  }
}

/** Silly Billy's cap is seen from high up there; seen from the side its front comes down to the tops of the eyes, so here it sits this much higher. */
const CAP_LIFT = 0.05

// ------------------------------------------------------------------------------ the nine built here

/** A piece built here, worn in `slot`; it behaves as people.ts's do (held in a hand when not worn, soft, not solid). */
function built(slot: Slot, name: string, build: (m: Kit) => void): Piece['make'] {
  return () =>
    buildRecipe((m) => {
      build(m)
      return { carry: 'hand', wear: slot, bouncy: 0.2, solid: false }
    }, [name])
}

/** The hair close round the skull every style but the curls and the pigtails starts from: over the top, the sides and the back, and none of the face. */
function scalp(m: Kit) {
  m.sphere(R * 1.1, { at: [0, 0.035, -0.04], color: MAIN })
}

const hairLong = built('hair', 'long hair', (m) => {
  scalp(m)
  // A fringe swept to one side, above the brows.
  m.sphere(0.12, { at: [0.03, 0.17, 0.08], scale: [1.7, 0.55, 0.85], color: MAIN })
  // A curtain down the back past the shoulders, behind the head.
  m.sphere(0.25, { at: [0, -0.17, -0.11], scale: [1.05, 1.3, 0.6], color: MAIN })
  // A lock down each side, behind the cheeks, its end rounded.
  for (const s of [-1, 1]) {
    m.tube([[s * 0.19, 0.1, -0.02], [s * 0.235, -0.08, -0.04], [s * 0.23, -0.27, -0.07], [s * 0.2, -0.42, -0.09]], 0.07, { color: MAIN })
    m.sphere(0.07, { at: [s * 0.2, -0.42, -0.09], color: MAIN })
  }
})

const hairBob = built('hair', 'bob', (m) => {
  m.sphere(R * 1.1, { at: [0, 0.04, -0.045], color: MAIN })
  // The straight fringe of a bob, cut level above the brows.
  m.sphere(0.13, { at: [0, 0.19, 0.075], scale: [1.75, 0.45, 0.8], color: MAIN })
  // Thick locks all round the sides and the back, each down to the chin: an even, rounded edge, open at the front for the face.
  for (let i = 0; i <= 8; i++) {
    const a = 1.25 + ((2 * Math.PI - 2.5) * i) / 8
    m.capsule(0.08, 0.22, { at: [Math.sin(a) * 0.205, -0.04, Math.cos(a) * 0.205 - 0.045], color: MAIN })
  }
})

const hairBun = built('hair', 'bun', (m) => {
  scalp(m)
  m.sphere(0.11, { at: [0, 0.17, 0.08], scale: [1.6, 0.55, 0.85], color: MAIN })
  // A round bun high on the top, its tie round its foot.
  m.sphere(0.125, { at: [0, 0.31, -0.06], color: MAIN })
  m.torus(0.1, 0.026, { at: [0, 0.225, -0.055], rot: [Math.PI / 2, 0, 0], color: SECOND })
})

/** Where the spikes stand out of the scalp: all round the top, the sides and the back, none over the face. */
const SPIKES: readonly Vec3[] = spread(30).filter((d) => d[1] > -0.15 && !(d[2] > 0.25 && d[1] < 0.6))

const hairSpiky = built('hair', 'spiky hair', (m) => {
  const centre: Vec3 = [0, 0.04, -0.035]
  m.sphere(R * 1.09, { at: centre, color: MAIN })
  const spike = (d: Vec3, from: number, r: number, h: number) => {
    const l = Math.hypot(d[0], d[1], d[2])
    const u: Vec3 = [d[0] / l, d[1] / l, d[2] / l]
    const out = from + h / 2
    m.cone(r, h, { at: [centre[0] + u[0] * out, centre[1] + u[1] * out, centre[2] + u[2] * out], rot: alongY(u), color: MAIN })
  }
  for (const d of SPIKES) spike(d, 0.2, 0.075, 0.2)
  // The front spikes stand up over the forehead and lean forward a little, clear of the brows.
  for (const x of [-0.12, -0.04, 0.04, 0.12]) spike([x, 0.75, 0.55], 0.2, 0.065, 0.18)
})

/** A cat's ear: a flat cone, its inside pink, standing on the head at side `s`. */
function catEar(m: Kit, s: number) {
  const tilt: Vec3 = [-0.12, 0, -s * 0.38]
  m.cone(0.11, 0.24, { at: [s * 0.15, 0.37, -0.03], rot: tilt, scale: [1, 1, 0.5], color: MAIN })
  m.cone(0.065, 0.15, { at: [s * 0.143, 0.35, 0.0], rot: tilt, scale: [1, 1, 0.3], color: SECOND })
}

const catEars = built('head', 'cat ears', (m) => {
  for (const s of [-1, 1]) catEar(m, s)
})

const bunnyEars = built('head', 'bunny ears', (m) => {
  // A band over the top holds them, from ear to ear behind the hairline.
  m.tube([[-0.265, 0.05, -0.06], [-0.2, 0.22, -0.06], [0, 0.3, -0.06], [0.2, 0.22, -0.06], [0.265, 0.05, -0.06]], 0.026, { color: SECOND })
  for (const s of [-1, 1]) {
    const tilt: Vec3 = [-0.1, 0, -s * 0.22]
    m.capsule(0.078, 0.34, { at: [s * 0.12, 0.54, -0.07], rot: tilt, scale: [1, 1, 0.5], color: MAIN })
    m.capsule(0.042, 0.28, { at: [s * 0.118, 0.54, -0.035], rot: tilt, scale: [1, 1, 0.3], color: SECOND })
  }
})

const crown = built('head', 'crown', (m) => {
  // A gold band with a thickness, round the top of the head, and five points with a ball on each.
  m.lathe([[0.15, 0.23], [0.17, 0.23], [0.2, 0.34], [0.18, 0.34], [0.15, 0.23]], { at: [0, 0, -0.03], color: MAIN })
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    const x = Math.sin(a) * 0.19
    const z = Math.cos(a) * 0.19 - 0.03
    m.cone(0.055, 0.14, { at: [x, 0.41, z], color: MAIN })
    m.sphere(0.028, { at: [x, 0.49, z], color: MAIN })
  }
  m.sphere(0.035, { at: [0, 0.29, 0.165], scale: [1, 1, 0.6], color: SECOND })
  for (const s of [-1, 1]) m.sphere(0.026, { at: [s * 0.115, 0.29, 0.125], rot: [0, s * 0.6, 0], scale: [1, 1, 0.6], color: GEM_BLUE })
})

/**
 * Where the bow and the flower sit, and which way each faces: high on the front of the head, a
 * little to one side, facing forward and a little up. The house sees a kid turned 0.95 rad from the
 * viewer, their -x side when they face right and their +x side when they face left, so a thing
 * facing forward is seen at the same slant both ways, and one facing the side only one way.
 */
const BOW: { at: Vec3; out: Vec3 } = { at: [0.09, 0.27, 0.07], out: [-0.05, 0.5, 0.86] }
const FLOWER: { at: Vec3; out: Vec3 } = { at: [0.12, 0.27, 0.09], out: [-0.05, 0.42, 0.9] }

const bow = built('head', 'bow', (m) => {
  m.part('bow', { at: BOW.at, rot: alongY(BOW.out) }, () => {
    // Two loops from the knot, lying on the hair, the knot in the middle.
    for (const s of [-1, 1]) m.cone(0.1, 0.17, { at: [s * 0.095, 0.025, 0], rot: [0, 0, s * (Math.PI / 2)], scale: [1, 1, 0.55], color: MAIN })
    m.sphere(0.05, { at: [0, 0.035, 0], color: SECOND })
  })
})

const flower = built('head', 'flower', (m) => {
  m.part('flower', { at: FLOWER.at, rot: alongY(FLOWER.out) }, () => {
    for (const [x, z] of [[0.08, 0.09], [-0.09, 0.075]] as const) m.sphere(0.065, { at: [x, -0.005, z], scale: [1, 0.25, 0.5], rot: [0, Math.atan2(x, z) - Math.PI / 2, 0], color: LEAF })
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2
      m.sphere(0.06, { at: [Math.cos(a) * 0.075, 0.025, Math.sin(a) * 0.075], scale: [1, 0.4, 1], color: MAIN })
    }
    m.sphere(0.045, { at: [0, 0.045, 0], scale: [1, 0.6, 1], color: SECOND })
  })
})

// ------------------------------------------------------------------------------ on the curls

/**
 * Silly Billy's big curls stand out half again as far as any other hair, so a thing on the head
 * made for the others would sink into them. On the curls it is worn grown and lifted by this much,
 * round the middle of the head: the crown's band, the bow and the flower show over the curls.
 */
export const ON_CURLS = { grow: 1.3, lift: 0.04 } as const

/** A head piece as it is worn on the curls (ON_CURLS). */
export function onCurls(recipe: Recipe): Recipe {
  const { grow, lift } = ON_CURLS
  const placed = (at: Vec3, by: number): Vec3 => [at[0] * grow, at[1] * grow + by, at[2] * grow]
  // Only what sits at the top level is lifted; what is inside a part moves with its pivot.
  const shapes = recipe.shapes.map((s) => ({ ...s, at: placed(s.at, s.part === null ? lift : 0), scale: [s.scale[0] * grow, s.scale[1] * grow, s.scale[2] * grow] as Vec3 }))
  const parts = recipe.parts.map((p) => ({ ...p, at: placed(p.at, p.parent === null ? lift : 0) }))
  return { ...recipe, shapes, parts, bounds: boundsOf(shapes, parts) }
}

// ------------------------------------------------------------------------------ the fourteen

export const PIECES: Readonly<Record<PieceName, Piece>> = {
  'hair-short': { slot: 'hair', make: imported('hair-short', { brown: 'main' }, 0), colours: hairColours },
  'hair-long': { slot: 'hair', make: hairLong, colours: hairColours },
  'hair-bob': { slot: 'hair', make: hairBob, colours: hairColours },
  'hair-pigtails': { slot: 'hair', make: imported('hair-pigtails', { brown: 'main', hotpink: 'second' }, 0), colours: hairColours },
  'hair-bun': { slot: 'hair', make: hairBun, colours: hairColours },
  'hair-curly': { slot: 'hair', make: imported('hair-curly', { brown: 'main' }, 0), colours: hairColours },
  'hair-spiky': { slot: 'hair', make: hairSpiky, colours: hairColours },
  // A cat's ears are the hair's colour, as the gallery draws them.
  'cat-ears': { slot: 'head', make: catEars, colours: (hair) => ({ main: hair, second: EAR_PINK }) },
  'bunny-ears': { slot: 'head', make: bunnyEars, colours: own('#ffffff', EAR_PINK) },
  crown: { slot: 'head', make: crown, colours: own(GOLD, GEM_RED) },
  bow: { slot: 'head', make: bow, colours: own(BOW_PINK, KNOT_PINK) },
  cap: { slot: 'head', make: imported('cap', { red: 'main', white: 'second' }, CAP_LIFT), colours: own(parseColor('red')!, '#ffffff') },
  glasses: { slot: 'face', make: imported('glasses', { black: 'main' }, 0), colours: own(parseColor('black')!, '#ffffff') },
  flower: { slot: 'head', make: flower, colours: own(PETAL, MIDDLE) },
}

export const PIECE_NAMES = Object.keys(PIECES) as PieceName[]
