import { rect } from '../game/layout'
import { C, TAU, at, blob, blush, circlesPath, eyes, ink, loop, mix, part, smile, tube, turnAbout, type SheetEntry } from './look'

/**
 * The game's one cat: a plain cat on the face kit, in a few coats, the same on every screen
 * (the cat rooms, the lift, Socks in the truck, the cats crossing the road). Facing right,
 * origin on the ground under its middle, SIZE.cat (0.45 m) to the ear tips sitting.
 *
 * Five poses: sitting up, walking (the legs swing in diagonal pairs through `step`), lying
 * as a loaf, peeking (the head and two front paws over an edge: a window sill, a basket's
 * rim, a box), and stretched in a jump. Any pose can wave its near front paw. A cat has
 * ink round every part and no ink on its marks (stripes, patches, the light muzzle and
 * chest); the face kit is told the fur under the eyes and the muzzle under the smile, so a
 * black cat's face reads as well as a ginger's.
 */

/** A cat's coat: its fur, its tabby stripes or calico patches (two colours), its light muzzle, chest and paws. */
interface Coat {
  fur: string
  mark: string
  patch: string
  light: string
  marks: 'stripes' | 'patches' | 'none'
}
/** The cats' palette: plain cats in five coats, and the one pink nose. */
export const CAT_COATS = {
  ginger: { fur: '#F7A453', mark: '#DB7E2E', patch: '#DB7E2E', light: C.paper, marks: 'stripes' },
  grey: { fur: '#959EB3', mark: '#727B91', patch: '#727B91', light: '#F1F3F8', marks: 'stripes' },
  /** Black and white: a dark coat with a white muzzle, chest and paws. */
  tuxedo: { fur: '#464B5F', mark: '#464B5F', patch: '#464B5F', light: C.white, marks: 'none' },
  calico: { fur: '#FFF8EF', mark: '#F2A04E', patch: '#5A5F73', light: C.white, marks: 'patches' },
  cream: { fur: '#F8DCAE', mark: '#E3B271', patch: '#E3B271', light: '#FFF6E6', marks: 'stripes' },
} as const satisfies Record<string, Coat>
export type CatCoat = keyof typeof CAT_COATS
const NOSE = '#FF7F9E'

/** A leg from the body to a paw: x0, y0 at the body, x1, y1 at the paw, and its phase in a walk's stride (0 or 0.5: the legs swing in diagonal pairs). */
type Leg = readonly [number, number, number, number, number]
/** A cat's body in one pose, origin on the ground under its middle, facing right. */
interface CatBody {
  /** The body as one blob of circles (x, y, r triples); none when only the head and paws peek over an edge. */
  blob: readonly number[]
  /** The near haunch (x, y, rx, ry), or null when the legs are stretched out. */
  haunch: readonly [number, number, number, number] | null
  /** The light chest (x, y, rx, ry), or null with no body. */
  chest: readonly [number, number, number, number] | null
  /** Legs: the far ones behind the body, the near ones in front of it (the first near leg is the front one, the one that waves). */
  far: readonly Leg[]
  near: readonly Leg[]
  /** The near legs (the paws on an edge) go over the head rather than under it. */
  pawsOver: boolean
  /** The tail's root, bend and tip at rest, or null when it is out of sight; it swings about its root, in front of the body when `front`. */
  tail: { x: number; y: number; bx: number; by: number; tx: number; ty: number; front: boolean } | null
  head: { x: number; y: number; r: number }
  /** Tabby stripes (x, y, angle) and calico patches (x, y, rx, ry) on the body. */
  stripes: readonly (readonly [number, number, number])[]
  patches: readonly (readonly [number, number, number, number])[]
}

export const CAT_POSES = ['sit', 'walk', 'lie', 'peek', 'jump'] as const
type CatPose = (typeof CAT_POSES)[number]

const CAT_BODIES: Record<CatPose, CatBody> = {
  sit: {
    blob: [-0.06, -0.11, 0.112, 0.0, -0.17, 0.1, 0.045, -0.225, 0.08],
    haunch: [-0.075, -0.085, 0.085, 0.075],
    chest: [0.08, -0.17, 0.042, 0.075],
    far: [[0.035, -0.15, 0.04, -0.022, 0]],
    near: [[0.085, -0.15, 0.095, -0.022, 0]],
    pawsOver: false,
    tail: { x: -0.14, y: -0.04, bx: -0.32, by: -0.02, tx: -0.27, ty: -0.22, front: false },
    head: { x: 0.07, y: -0.31, r: 0.11 },
    stripes: [
      [-0.12, -0.17, -0.5],
      [-0.07, -0.21, -0.2],
      [-0.01, -0.25, 0.1],
    ],
    patches: [
      [-0.1, -0.16, 0.075, 0.06],
      [-0.02, -0.06, 0.06, 0.045],
    ],
  },
  walk: {
    blob: [-0.1, -0.18, 0.085, 0.0, -0.19, 0.09, 0.09, -0.19, 0.08],
    haunch: [-0.11, -0.16, 0.07, 0.065],
    chest: [0.13, -0.17, 0.038, 0.055],
    far: [
      [0.07, -0.15, 0.075, -0.022, 0.5],
      [-0.12, -0.14, -0.12, -0.022, 0],
    ],
    near: [
      [0.1, -0.15, 0.105, -0.022, 0],
      [-0.09, -0.14, -0.09, -0.022, 0.5],
    ],
    pawsOver: false,
    tail: { x: -0.17, y: -0.21, bx: -0.3, by: -0.26, tx: -0.26, ty: -0.41, front: false },
    head: { x: 0.17, y: -0.3, r: 0.1 },
    stripes: [
      [-0.12, -0.24, 0],
      [-0.04, -0.26, 0],
      [0.04, -0.26, 0],
    ],
    patches: [
      [-0.1, -0.21, 0.07, 0.05],
      [0.05, -0.15, 0.05, 0.04],
    ],
  },
  lie: {
    blob: [-0.12, -0.085, 0.085, -0.02, -0.1, 0.1, 0.07, -0.085, 0.085],
    haunch: [-0.11, -0.07, 0.075, 0.06],
    chest: [0.13, -0.08, 0.04, 0.05],
    far: [],
    near: [[0.1, -0.03, 0.16, -0.022, 0]],
    pawsOver: false,
    tail: { x: -0.18, y: -0.04, bx: -0.24, by: 0.01, tx: -0.04, ty: -0.012, front: true },
    head: { x: 0.13, y: -0.18, r: 0.1 },
    stripes: [
      [-0.11, -0.16, 0],
      [-0.03, -0.185, 0],
      [0.05, -0.16, 0],
    ],
    patches: [
      [-0.13, -0.13, 0.07, 0.05],
      [0.02, -0.17, 0.06, 0.04],
    ],
  },
  peek: {
    blob: [],
    haunch: null,
    chest: null,
    far: [],
    near: [
      [0.08, -0.06, 0.085, -0.016, 0],
      [-0.07, -0.06, -0.075, -0.016, 0],
    ],
    pawsOver: true,
    tail: null,
    head: { x: 0.0, y: -0.14, r: 0.11 },
    stripes: [],
    patches: [],
  },
  jump: {
    blob: [-0.12, -0.15, 0.075, -0.01, -0.17, 0.085, 0.1, -0.18, 0.072],
    haunch: null,
    chest: [0.14, -0.15, 0.04, 0.05],
    far: [
      [0.1, -0.16, 0.24, -0.15, 0],
      [-0.12, -0.14, -0.25, -0.07, 0],
    ],
    near: [
      [0.12, -0.14, 0.25, -0.1, 0],
      [-0.1, -0.12, -0.23, -0.04, 0],
    ],
    pawsOver: false,
    tail: { x: -0.18, y: -0.17, bx: -0.3, by: -0.22, tx: -0.36, ty: -0.14, front: false },
    head: { x: 0.17, y: -0.25, r: 0.1 },
    stripes: [
      [-0.12, -0.21, 0.2],
      [-0.04, -0.235, 0.1],
      [0.04, -0.235, 0],
    ],
    patches: [
      [-0.1, -0.2, 0.07, 0.05],
      [0.05, -0.13, 0.05, 0.04],
    ],
  },
}

/** A walking paw swings this far either way of its rest, and lifts this high while it swings forward. */
const STRIDE = { swing: 0.045, lift: 0.03 }
/** A waving paw turns up this far about its shoulder (radians), forward and up. */
const WAVE_UP = 2.3

/** A cat's moment: its coat and pose, its face, the tail's swing (radians about its root), the head's lift (metres, up) and tilt (radians), a walk's stride (0 to 1 round one step), the near front paw's wave (0 down, 1 up: the caller waggles it); a kitten has a bigger head for its size. */
export interface CatPic {
  coat: CatCoat
  pose: CatPose
  eyes: 'open' | 'happy' | 'closed' | 'wide'
  meow: boolean
  tail: number
  lift: number
  tilt: number
  step: number
  wave: number
  kitten: boolean
}

/** The tail from its root, swung by `swing` radians (the tip twice as far as the bend). */
function catTail(ctx: CanvasRenderingContext2D, tail: NonNullable<CatBody['tail']>, coat: Coat, swing: number) {
  const { x, y } = tail
  const [bx, by] = turnAbout(tail.bx, tail.by, x, y, swing * 0.5)
  const [tx, ty] = turnAbout(tail.tx, tail.ty, x, y, swing)
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.quadraticCurveTo(bx, by, tx, ty)
  tube(ctx, 0.046, coat.fur)
}

/** One leg as a fur tube ending in a light paw: swung through a walk's `step`, or turned up by `wave`. */
function catLeg(ctx: CanvasRenderingContext2D, leg: Leg, coat: Coat, walking: boolean, step: number, wave: number) {
  const [x0, y0, rx, ry, phase] = leg
  let [x1, y1] = turnAbout(rx, ry, x0, y0, -WAVE_UP * wave)
  if (walking && wave === 0) {
    const a = TAU * (step + phase)
    x1 += STRIDE.swing * Math.sin(a)
    y1 -= STRIDE.lift * Math.max(0, Math.cos(a))
  }
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  tube(ctx, 0.05, coat.fur)
  ctx.beginPath()
  ctx.ellipse(x1 + 0.012, y1, 0.04, 0.024, 0, 0, TAU)
  part(ctx, coat.light, 'line')
}

/** The head of radius r at (x, y), facing right: ears (their pink inside from M), the face kit on the fur and the muzzle, a pink nose, the coat's marks from M, whiskers at L. */
function catHead(ctx: CanvasRenderingContext2D, coat: Coat, x: number, y: number, r: number, pic: CatPic, lod: 'S' | 'M' | 'L') {
  const fine = lod !== 'S'
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(pic.tilt)
  const ears = [
    [-0.86, -0.32, -0.72, -1.34, -0.14, -0.86],
    [0.04, -0.9, 0.6, -1.36, 0.84, -0.42],
  ] as const
  for (const [ax, ay, tx, ty, bx, by] of ears) {
    ctx.beginPath()
    ctx.moveTo(ax * r, ay * r)
    ctx.lineTo(tx * r, ty * r)
    ctx.lineTo(bx * r, by * r)
    ctx.closePath()
    part(ctx, coat.fur, 'line')
    if (fine) {
      // The inner ear, a smaller triangle towards the tip.
      const cx = (ax + bx) / 2
      const cy = (ay + by) / 2
      ctx.beginPath()
      ctx.moveTo(mix(ax, cx, 0.45) * r, mix(ay, cy, 0.45) * r)
      ctx.lineTo(mix(tx, cx, 0.25) * r, mix(ty, cy, 0.25) * r)
      ctx.lineTo(mix(bx, cx, 0.45) * r, mix(by, cy, 0.45) * r)
      ctx.closePath()
      ctx.fillStyle = C.innerEar
      ctx.fill()
    }
  }
  ctx.beginPath()
  ctx.ellipse(0, 0, 1.1 * r, 0.92 * r, 0, 0, TAU)
  part(ctx, coat.fur, 'line')
  if (fine && coat.marks !== 'none') {
    ctx.save()
    ctx.beginPath()
    ctx.ellipse(0, 0, 1.1 * r, 0.92 * r, 0, 0, TAU)
    ctx.clip()
    if (coat.marks === 'stripes') {
      ctx.lineCap = 'round'
      ctx.lineWidth = 0.17 * r
      ctx.strokeStyle = coat.mark
      ctx.beginPath()
      for (const dx of [-0.32, 0.0, 0.3]) {
        ctx.moveTo(dx * r, -0.92 * r)
        ctx.lineTo(dx * r * 1.15, -0.55 * r)
      }
      ctx.stroke()
    } else {
      ctx.beginPath()
      ctx.ellipse(-0.55 * r, -0.5 * r, 0.6 * r, 0.5 * r, 0.4, 0, TAU)
      ctx.fillStyle = coat.mark
      ctx.fill()
    }
    ctx.restore()
  }
  ctx.beginPath()
  ctx.ellipse(0.5 * r, 0.4 * r, 0.44 * r, 0.32 * r, 0, 0, TAU)
  ctx.fillStyle = coat.light
  ctx.fill()
  eyes(ctx, 0.46 * r, -0.08 * r, 0.42 * r, 0.6 * r, pic.eyes, coat.fur)
  ctx.beginPath()
  ctx.moveTo(0.62 * r, 0.16 * r)
  ctx.lineTo(0.86 * r, 0.16 * r)
  ctx.lineTo(0.74 * r, 0.3 * r)
  ctx.closePath()
  ctx.fillStyle = NOSE
  ctx.fill()
  smile(ctx, 0.72 * r, 0.36 * r, 0.32 * r, pic.meow, coat.light)
  if (fine) blush(ctx, 0.95 * r, 0.3 * r, 0.15 * r)
  if (lod === 'L') {
    ctx.beginPath()
    for (const dy of [0.2, 0.42]) {
      ctx.moveTo(1.02 * r, dy * r)
      ctx.lineTo(1.5 * r, (dy - 0.12 + dy * 0.3) * r)
    }
    ctx.lineCap = 'round'
    ink(ctx, 'detail')
  }
  ctx.restore()
}

/**
 * The cat in `pic`, origin on the ground under its middle (for a peek: on the edge under its
 * chin), facing right, at the detail `lod` its caller picks for the whole scene (S: the
 * silhouette, the face and the paws; M adds the coat's marks, the chest and the pink inside
 * the ears; L adds whiskers).
 */
export function drawCat(ctx: CanvasRenderingContext2D, pic: CatPic, lod: 'S' | 'M' | 'L'): void {
  const b = CAT_BODIES[pic.pose]
  const coat: Coat = CAT_COATS[pic.coat]
  const fine = lod !== 'S'
  const walking = pic.pose === 'walk'
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  if (b.tail && !b.tail.front) catTail(ctx, b.tail, coat, pic.tail)
  for (const leg of b.far) catLeg(ctx, leg, coat, walking, pic.step, 0)
  if (b.blob.length > 0) {
    blob(ctx, b.blob, coat.fur, 'line')
    if (fine) {
      ctx.save()
      circlesPath(ctx, b.blob)
      ctx.clip()
      if (coat.marks === 'stripes') {
        ctx.lineWidth = 0.028
        ctx.strokeStyle = coat.mark
        ctx.beginPath()
        for (const [x, y, a] of b.stripes) {
          ctx.moveTo(x - Math.sin(a) * 0.04, y - 0.04)
          ctx.lineTo(x + Math.sin(a) * 0.04, y + 0.045)
        }
        ctx.stroke()
      } else if (coat.marks === 'patches') {
        b.patches.forEach(([x, y, rx, ry], i) => {
          ctx.beginPath()
          ctx.ellipse(x, y, rx, ry, 0.3, 0, TAU)
          ctx.fillStyle = i === 0 ? coat.mark : coat.patch
          ctx.fill()
        })
      }
      if (b.chest) {
        const [cx, cy, crx, cry] = b.chest
        ctx.beginPath()
        ctx.ellipse(cx, cy, crx, cry, 0, 0, TAU)
        ctx.fillStyle = coat.light
        ctx.fill()
      }
      ctx.restore()
    }
  }
  if (b.haunch) {
    const [x, y, rx, ry] = b.haunch
    ctx.beginPath()
    ctx.ellipse(x, y, rx, ry, -0.2, 0, TAU)
    part(ctx, coat.fur, 'line')
  }
  const paws = () => b.near.forEach((leg, i) => catLeg(ctx, leg, coat, walking, pic.step, i === 0 ? pic.wave : 0))
  if (!b.pawsOver) paws()
  if (b.tail && b.tail.front) catTail(ctx, b.tail, coat, pic.tail)
  const r = b.head.r * (pic.kitten ? 1.25 : 1)
  catHead(ctx, coat, b.head.x, b.head.y - pic.lift - (r - b.head.r) * 0.6, r, pic, lod)
  if (b.pawsOver) paws()
  ctx.restore()
}

/** Draws the cat in `pic` at (x, y), turned by rot, facing right (1) or left (-1), at `scale`, squashed by sy (the width keeps the volume): a cat hopping, landing or sprung out of a box. */
export function catAt(ctx: CanvasRenderingContext2D, pic: CatPic, lod: 'S' | 'M' | 'L', x: number, y: number, facing: number, scale: number, sy: number, rot: number): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rot)
  ctx.scale((scale * facing) / Math.sqrt(sy), scale * sy)
  drawCat(ctx, pic, lod)
  ctx.restore()
}

// ---------------------------------------------------------------------------------------
// The sheet

/** A cat at rest in a pose: eyes open, the tail still, unless `patch` says otherwise. */
const still = (coat: CatCoat, pose: CatPose, patch: Partial<CatPic>): CatPic => ({ coat, pose, eyes: 'open', meow: false, tail: 0, lift: 0, tilt: 0, step: 0, wave: 0, kitten: false, ...patch })
/** A cat's cell: SIZE.cat tall sitting, the jump and the walk's tail reach further. */
const CAT_BOX = rect(-0.42, -0.52, 0.8, 0.56)
/** The cat drawn at `lod` in `pic` at sheet time t. */
const cat = (label: string, lod: 'S' | 'M' | 'L', pic: (t: number) => CatPic): SheetEntry => ({ label, box: CAT_BOX, draw: (ctx, t) => drawCat(ctx, pic(t), lod) })

/** ?sheet=animals: the cat in every pose and coat, walking, waving, meowing, as a kitten, and at the street's size. */
export const ANIMAL_SHEET: SheetEntry[] = [
  ...CAT_POSES.flatMap((pose) => (Object.keys(CAT_COATS) as CatCoat[]).map((coat) => cat(`${coat} cat, ${pose}`, 'L', (t) => still(coat, pose, { step: loop(t, 0.8, 0), tail: 0.2 * Math.sin(TAU * loop(t, 2.4, 0)) })))),
  cat('waving, happy (sit)', 'L', (t) => still('ginger', 'sit', { wave: 0.85 + 0.15 * Math.sin(TAU * 2.2 * t), eyes: 'happy', meow: true })),
  cat('waving while it walks', 'L', (t) => still('grey', 'walk', { step: loop(t, 0.8, 0), wave: 0.9, eyes: 'happy', meow: true })),
  cat('peeking, waving after a honk', 'L', (t) => still('tuxedo', 'peek', { wave: (t % 3) < 1.5 ? 0.8 : 0, eyes: (t % 3) < 0.4 ? 'wide' : 'happy', meow: (t % 3) < 1.5 })),
  cat('asleep as a loaf', 'L', () => still('calico', 'lie', { eyes: 'closed' })),
  cat('kitten, sitting', 'L', () => still('cream', 'sit', { kitten: true })),
  ...(['M', 'S'] as const).map((lod) => cat(`at ${lod} detail`, lod, (t) => still('ginger', 'walk', { step: loop(t, 0.8, 0) }))),
  at(48, CAT_BOX, 'black and white cat at street size, 48 px/m', (ctx, t) => drawCat(ctx, still('tuxedo', 'sit', { eyes: (t % 2) < 1 ? 'happy' : 'open' }), 'S')),
  at(400, CAT_BOX, 'black and white cat close up, 400 px/m', (ctx, t) => drawCat(ctx, still('tuxedo', 'sit', { eyes: (t % 2) < 1 ? 'happy' : 'closed' }), 'L')),
]
