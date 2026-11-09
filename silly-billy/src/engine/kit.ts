/**
 * The modelling kit: what an item's code builds its model with. A builder calls
 * `m.box(...)`, `m.sphere(...)` and the rest, nests named parts that can move, marks anchors,
 * and returns how the thing behaves. The kit turns that into a Recipe: plain data the scene
 * draws and the sim measures. Nothing here touches three.js.
 *
 * The kit forgives: a number that is not a number becomes a sensible default, sizes are
 * clamped, an unknown colour is grey, and a builder that makes too many shapes keeps the
 * first MAX_SHAPES. Every correction is written to `notes` so validation can show it.
 */

import { anglesXYZ, eulerXYZ, apply, mul, IDENTITY, type Mat3 } from './body'
import { FOODS, SLOTS, TEMPS, type Food, type ItemMeta, type ItemTraits, type PartDef, type Recipe, type Shape, type ShapeKind, type Slot, type Temp, type Vec3 } from './types'

export const MAX_SHAPES = 400
export const MAX_POINTS = 64
/** Parts beyond this many are not made: their shapes and anchors go to the part around them, where they were put, and only stop moving. */
export const MAX_PARTS = 120
const MIN_DIM = 0.005
const MAX_DIM = 30

/** The options every shape takes. */
export interface ShapeOpts {
  at?: number[]
  rot?: number[]
  scale?: number[]
  color?: string
  glow?: boolean
}

/** A quick draft shape, from the interpreter: enough to recognise the thing from afar. */
export interface RoughShape {
  shape: 'box' | 'sphere' | 'cylinder' | 'cone'
  /** box [w, h, d]; sphere [diameter x, y, z]; cylinder and cone [diameter, height, diameter]. */
  size: number[]
  at: number[]
  color: string
}

/** The game's own colours, softer than CSS's: the colour words a child says, which the verbs and the parser read (content/colors.ts). */
export const BASIC_COLORS: ReadonlyMap<string, string> = new Map(
  Object.entries({
    red: '#e8503f', darkred: '#a82a20', crimson: '#d7263d', maroon: '#7a2430', tomato: '#ff6347', coral: '#ff7f6a', salmon: '#fa8f72',
    pink: '#ff9ccf', hotpink: '#ff5fae', lightpink: '#ffc4e1', magenta: '#e040c0', fuchsia: '#e040c0', rose: '#ff6f91',
    purple: '#9b5fd3', violet: '#b07ce8', lavender: '#c9b3f2', indigo: '#4b3fa8', plum: '#a05aa0', orchid: '#d070d0', lilac: '#c8a2e8',
    blue: '#4a78e0', lightblue: '#9fd0ff', skyblue: '#7cc4f0', navy: '#23306e', darkblue: '#2a3f9e', royalblue: '#3d63d8', cyan: '#3ad6e0', aqua: '#3ad6e0',
    turquoise: '#3cc8c0', teal: '#2a9d8f',
    green: '#5ec25a', lightgreen: '#9be38a', lime: '#9be02f', darkgreen: '#2f7a3a', olive: '#7d8a2e', mint: '#a8ecc8', forestgreen: '#2f8a3f',
    yellow: '#f5d33b', lightyellow: '#fff3a0', gold: '#f2c14e', golden: '#f2c14e', orange: '#f5a13b', darkorange: '#e07a1a', peach: '#ffc29a',
    brown: '#8a5a34', darkbrown: '#5a3a24', chocolate: '#7b4a2a', tan: '#d2a679', beige: '#e8dcc0', khaki: '#c9b47a', wheat: '#f0dcb0', sand: '#e8d29a',
    black: '#2b2b30', white: '#fbf8f2', ivory: '#fffbe8', cream: '#fff4d8', gray: '#9aa3ad', grey: '#9aa3ad', lightgray: '#c9ced6', lightgrey: '#c9ced6',
    darkgray: '#5e6570', darkgrey: '#5e6570', silver: '#c0c6cf', snow: '#ffffff', skin: '#ffd9b3',
  }),
)

/** The rest of the CSS colour names, as CSS has them: a designer may use any of them, but a child saying 'seashell' or 'peru' means a thing or a word. */
const CSS_COLORS: ReadonlyMap<string, string> = new Map(
  Object.entries({
    aliceblue: '#f0f8ff', antiquewhite: '#faebd7', aquamarine: '#7fffd4', azure: '#f0ffff', bisque: '#ffe4c4', blanchedalmond: '#ffebcd', blueviolet: '#8a2be2',
    burlywood: '#deb887', cadetblue: '#5f9ea0', chartreuse: '#7fff00', cornflowerblue: '#6495ed', cornsilk: '#fff8dc', darkcyan: '#008b8b', darkgoldenrod: '#b8860b',
    darkkhaki: '#bdb76b', darkmagenta: '#8b008b', darkolivegreen: '#556b2f', darkorchid: '#9932cc', darksalmon: '#e9967a', darkseagreen: '#8fbc8f', darkslateblue: '#483d8b',
    darkslategray: '#2f4f4f', darkslategrey: '#2f4f4f', darkturquoise: '#00ced1', darkviolet: '#9400d3', deeppink: '#ff1493', deepskyblue: '#00bfff', dimgray: '#696969',
    dimgrey: '#696969', dodgerblue: '#1e90ff', firebrick: '#b22222', floralwhite: '#fffaf0', gainsboro: '#dcdcdc', ghostwhite: '#f8f8ff', goldenrod: '#daa520',
    greenyellow: '#adff2f', honeydew: '#f0fff0', indianred: '#cd5c5c', lavenderblush: '#fff0f5', lawngreen: '#7cfc00', lemonchiffon: '#fffacd', lightcoral: '#f08080',
    lightcyan: '#e0ffff', lightgoldenrodyellow: '#fafad2', lightsalmon: '#ffa07a', lightseagreen: '#20b2aa', lightskyblue: '#87cefa', lightslategray: '#778899',
    lightslategrey: '#778899', lightsteelblue: '#b0c4de', limegreen: '#32cd32', linen: '#faf0e6', mediumaquamarine: '#66cdaa', mediumblue: '#0000cd', mediumorchid: '#ba55d3',
    mediumpurple: '#9370db', mediumseagreen: '#3cb371', mediumslateblue: '#7b68ee', mediumspringgreen: '#00fa9a', mediumturquoise: '#48d1cc', mediumvioletred: '#c71585',
    midnightblue: '#191970', mintcream: '#f5fffa', mistyrose: '#ffe4e1', moccasin: '#ffe4b5', navajowhite: '#ffdead', oldlace: '#fdf5e6', olivedrab: '#6b8e23',
    orangered: '#ff4500', palegoldenrod: '#eee8aa', palegreen: '#98fb98', paleturquoise: '#afeeee', palevioletred: '#db7093', papayawhip: '#ffefd5', peachpuff: '#ffdab9',
    peru: '#cd853f', powderblue: '#b0e0e6', rebeccapurple: '#663399', rosybrown: '#bc8f8f', saddlebrown: '#8b4513', sandybrown: '#f4a460', seagreen: '#2e8b57',
    seashell: '#fff5ee', sienna: '#a0522d', slateblue: '#6a5acd', slategray: '#708090', slategrey: '#708090', springgreen: '#00ff7f', steelblue: '#4682b4',
    thistle: '#d8bfd8', whitesmoke: '#f5f5f5', yellowgreen: '#9acd32',
  }),
)

const hex2 = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')

/** '#rrggbb' from a hue in degrees and saturation and lightness 0..1. */
function hslHex(h: number, sat: number, light: number): string {
  const hue = ((h % 360) + 360) % 360
  const s = Math.max(0, Math.min(1, sat))
  const l = Math.max(0, Math.min(1, light))
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + hue / 30) % 12
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
  }
  return `#${hex2(f(0) * 255)}${hex2(f(8) * 255)}${hex2(f(4) * 255)}`
}

/** A colour as '#rrggbb': hex in 3, 4, 6 or 8 digits (see-through is dropped), rgb(), hsl(), a CSS colour name or one a child would say. Anything else is null. */
export function parseColor(c: unknown): string | null {
  if (typeof c !== 'string') return null
  const s = c.trim().toLowerCase().replace(/\s+/g, '')
  // A Map, not an object: 'constructor' or '__proto__' must not find Object's own fields.
  const named = BASIC_COLORS.get(s) ?? CSS_COLORS.get(s)
  if (named !== undefined) return named
  let m = /^#?([0-9a-f]{6})$/.exec(s) ?? /^#([0-9a-f]{6})[0-9a-f]{2}$/.exec(s)
  if (m) return `#${m[1]}`
  m = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s) ?? /^#([0-9a-f])([0-9a-f])([0-9a-f])[0-9a-f]$/.exec(s)
  if (m) return `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`
  // rgb(255, 0, 0), rgb(255 0 0 / 50%), hsl(330, 100%, 70%): the numbers however they are parted.
  const f = /^(rgb|hsl)a?\(([^)]*)\)?$/.exec(c.trim().toLowerCase())
  if (f) {
    const v = f[2]!.split(/[\s,/]+/).filter((x) => x !== '')
    const n = v.map((x) => parseFloat(x))
    if (n.length >= 3 && n.slice(0, 3).every(Number.isFinite)) {
      if (f[1] === 'hsl') return hslHex(n[0]!, n[1]! / 100, n[2]! / 100)
      return `#${[0, 1, 2].map((i) => hex2(v[i]!.endsWith('%') ? n[i]! * 2.55 : n[i]!)).join('')}`
    }
  }
  return null
}

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && Number.isFinite(Number(v)) && v.trim() !== '' ? Number(v) : fallback)
const dim = (v: unknown, fallback: number) => Math.min(MAX_DIM, Math.max(MIN_DIM, Math.abs(num(v, fallback))))
const vec = (v: unknown, fallback: number): Vec3 => {
  const a = Array.isArray(v) ? v : []
  return [num(a[0], fallback), num(a[1], fallback), num(a[2], fallback)].map((x) => Math.max(-MAX_DIM, Math.min(MAX_DIM, x))) as Vec3
}

export class Kit {
  readonly shapes: Shape[] = []
  readonly parts: PartDef[] = []
  readonly anchors: Recipe['anchors'] = {}
  readonly notes: string[] = []
  private current: string | null = null
  /** Inside a part past MAX_PARTS: where its pivot would be in `current`'s frame (`r` null when nothing turns it), to move what is made inside by. */
  private pivot: { p: Vec3; r: Mat3 | null } | null = null
  /** Every part's own name, and how many copies each name the builder used has. */
  private readonly names = new Set<string>()
  private readonly copies = new Map<string, number>()

  private add(kind: ShapeKind, dims: number[], points: number[][] | null, opts: unknown) {
    if (this.shapes.length >= MAX_SHAPES) {
      if (this.shapes.length === MAX_SHAPES && !this.notes.includes('too many shapes')) this.notes.push('too many shapes')
      return
    }
    const o = (opts && typeof opts === 'object' ? opts : {}) as ShapeOpts
    const color = o.color === undefined ? '#c9ced6' : parseColor(o.color)
    if (color === null) this.notes.push(`unknown colour ${JSON.stringify(o.color)}`)
    const scale = vec(o.scale, 1).map((s) => (Math.abs(s) < 0.01 ? 0.01 : s)) as Vec3
    const rot = vec(o.rot, 0)
    const turn = this.pivot?.r ?? null
    this.shapes.push({ kind, dims, points, at: this.placed(vec(o.at, 0)), rot: turn === null ? rot : anglesXYZ(mul(turn, eulerXYZ(rot[0], rot[1], rot[2]))), scale, color: color ?? '#9aa3ad', glow: o.glow === true, part: this.current })
  }

  /** A point given inside a part past MAX_PARTS, in the frame of the part around it. */
  private placed(at: Vec3): Vec3 {
    const b = this.pivot
    if (b === null) return at
    const o = b.r === null ? at : apply(b.r, at)
    return [b.p[0] + o[0], b.p[1] + o[1], b.p[2] + o[2]]
  }

  private pointList(points: unknown, size: number): number[][] {
    if (!Array.isArray(points)) {
      this.notes.push('points is not a list')
      return []
    }
    if (points.length > MAX_POINTS) this.notes.push(`more than ${MAX_POINTS} points`)
    return points.slice(0, MAX_POINTS).map((p) => {
      const a = Array.isArray(p) ? p : []
      return Array.from({ length: size }, (_, i) => Math.max(-MAX_DIM, Math.min(MAX_DIM, num(a[i], 0))))
    })
  }

  box(w: number, h: number, d: number, opts?: ShapeOpts) {
    this.add('box', [dim(w, 0.5), dim(h, 0.5), dim(d, 0.5)], null, opts)
  }

  sphere(r: number, opts?: ShapeOpts) {
    this.add('sphere', [dim(r, 0.25)], null, opts)
  }

  /** Upright along y, centred on `at`. rTop 0 makes a cone. */
  cylinder(rTop: number, rBottom: number, h: number, opts?: ShapeOpts) {
    this.add('cylinder', [Math.min(MAX_DIM, Math.abs(num(rTop, 0.25))), Math.min(MAX_DIM, Math.abs(num(rBottom, 0.25))), dim(h, 0.5)], null, opts)
  }

  cone(r: number, h: number, opts?: ShapeOpts) {
    this.cylinder(0, r, h, opts)
  }

  /** A ring in the x-y plane, its hole looking along z. */
  torus(r: number, tube: number, opts?: ShapeOpts) {
    this.add('torus', [dim(r, 0.3), dim(tube, 0.05)], null, opts)
  }

  /** Upright: `length` is the straight middle, plus a round end of radius r at each end. */
  capsule(r: number, length: number, opts?: ShapeOpts) {
    this.add('capsule', [dim(r, 0.1), Math.min(MAX_DIM, Math.abs(num(length, 0.3)))], null, opts)
  }

  /** A round shape turned around the y axis through [[r, y], ...]. */
  lathe(points: number[][], opts?: ShapeOpts) {
    const pts = this.pointList(points, 2).map(([r, y]) => [Math.abs(r!), y!])
    if (pts.length < 2) return void this.notes.push('lathe needs two points')
    this.add('lathe', [], pts, opts)
  }

  /** A flat outline [[x, y], ...] made `depth` thick along z, centred on z. */
  extrude(points: number[][], depth: number, opts?: ShapeOpts) {
    const pts = this.pointList(points, 2)
    if (pts.length < 3) return void this.notes.push('extrude needs three points')
    this.add('extrude', [dim(depth, 0.1)], pts, opts)
  }

  /** A bendy tube of radius r through [[x, y, z], ...]. */
  tube(points: number[][], r: number, opts?: ShapeOpts) {
    const pts = this.pointList(points, 3)
    if (pts.length < 2) return void this.notes.push('tube needs two points')
    this.add('tube', [dim(r, 0.03)], pts, opts)
  }

  /**
   * Shapes and anchors made inside `fn` belong to a part named `name` that pivots at `at` (opts
   * may be left out: `m.part('lid', () => ...)`). A name made again is another copy of that part
   * at its own pivot, posed by the same name: every other bauble twinkles as 'light0'.
   */
  part(name: string, opts: { at?: number[]; rot?: number[] } | (() => void) | undefined, fn?: () => void) {
    if (typeof opts === 'function' && typeof fn !== 'function') {
      fn = opts
      opts = undefined
    }
    const o = opts !== null && typeof opts === 'object' ? opts : undefined
    const n = String(name)
    const outer = this.current
    const outerPivot = this.pivot
    let inner: string | null = null
    if (this.parts.length >= MAX_PARTS) {
      if (!this.notes.includes('too many parts')) this.notes.push('too many parts')
      // Not made: what is made inside is moved by its pivot instead, so it stays where it was put.
      const rot = vec(o?.rot, 0)
      const turn = rot.some((v) => v !== 0) ? eulerXYZ(rot[0], rot[1], rot[2]) : null
      this.pivot = { p: this.placed(vec(o?.at, 0)), r: turn === null ? (outerPivot?.r ?? null) : mul(outerPivot?.r ?? IDENTITY, turn) }
    } else {
      let own = n
      for (let k = (this.copies.get(n) ?? 1) + 1; this.names.has(own); k++) {
        own = `${n}~${k}`
        this.copies.set(n, k)
      }
      this.names.add(own)
      this.parts.push({ name: own, at: vec(o?.at, 0), rot: vec(o?.rot, 0), parent: outer, ...(own === n ? {} : { pose: n }) })
      inner = own
    }
    this.current = inner ?? outer
    try {
      if (typeof fn === 'function') fn()
      else this.notes.push(`part ${n} has no function`)
    } finally {
      this.current = outer
      this.pivot = outerPivot
    }
  }

  /** A named point actions use: 'seat', 'hand', 'top', 'front'... in the current part's frame. */
  anchor(name: string, at: number[]) {
    this.anchors[String(name)] = { at: this.placed(vec(at, 0)), part: this.current }
  }
}

// ------------------------------------------------------------------------------ bounds

/** A shape's own box before its transform. */
function localBox(s: Shape): { min: Vec3; max: Vec3 } {
  const [a = 0.1, b = 0.1, c = 0.1] = s.dims
  switch (s.kind) {
    case 'box':
      return { min: [-a / 2, -b / 2, -c / 2], max: [a / 2, b / 2, c / 2] }
    case 'sphere':
      return { min: [-a, -a, -a], max: [a, a, a] }
    case 'cylinder': {
      const r = Math.max(a, b)
      return { min: [-r, -c / 2, -r], max: [r, c / 2, r] }
    }
    case 'torus':
      return { min: [-(a + b), -(a + b), -b], max: [a + b, a + b, b] }
    case 'capsule':
      return { min: [-a, -b / 2 - a, -a], max: [a, b / 2 + a, a] }
    case 'lathe': {
      const pts = s.points!
      const r = Math.max(...pts.map((p) => p[0]!))
      return { min: [-r, Math.min(...pts.map((p) => p[1]!)), -r], max: [r, Math.max(...pts.map((p) => p[1]!)), r] }
    }
    case 'extrude': {
      const pts = s.points!
      return { min: [Math.min(...pts.map((p) => p[0]!)), Math.min(...pts.map((p) => p[1]!)), -a / 2], max: [Math.max(...pts.map((p) => p[0]!)), Math.max(...pts.map((p) => p[1]!)), a / 2] }
    }
    case 'tube': {
      const pts = s.points!
      const lo = [0, 1, 2].map((i) => Math.min(...pts.map((p) => p[i]!)) - a) as Vec3
      const hi = [0, 1, 2].map((i) => Math.max(...pts.map((p) => p[i]!)) + a) as Vec3
      return { min: lo, max: hi }
    }
  }
}

/** A part's rest transform in the item's frame. */
export function partTransform(parts: PartDef[], name: string | null): { p: Vec3; r: Mat3 } {
  if (name === null) return { p: [0, 0, 0], r: IDENTITY }
  const def = parts.find((p) => p.name === name)
  if (!def) return { p: [0, 0, 0], r: IDENTITY }
  const parent = partTransform(parts, def.parent)
  const o = apply(parent.r, def.at)
  return { p: [parent.p[0] + o[0], parent.p[1] + o[1], parent.p[2] + o[2]], r: mul(parent.r, eulerXYZ(def.rot[0], def.rot[1], def.rot[2])) }
}

export function boundsOf(shapes: Shape[], parts: PartDef[]): Recipe['bounds'] {
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const s of shapes) {
    const box = localBox(s)
    const rot = eulerXYZ(s.rot[0], s.rot[1], s.rot[2])
    const frame = partTransform(parts, s.part)
    for (let i = 0; i < 8; i++) {
      const corner: Vec3 = [(i & 1 ? box.max[0] : box.min[0]) * s.scale[0], (i & 2 ? box.max[1] : box.min[1]) * s.scale[1], (i & 4 ? box.max[2] : box.min[2]) * s.scale[2]]
      const r = apply(rot, corner)
      const inPart: Vec3 = [r[0] + s.at[0], r[1] + s.at[1], r[2] + s.at[2]]
      const o = apply(frame.r, inPart)
      const w: Vec3 = [o[0] + frame.p[0], o[1] + frame.p[1], o[2] + frame.p[2]]
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k]!, w[k]!)
        max[k] = Math.max(max[k]!, w[k]!)
      }
    }
  }
  if (!Number.isFinite(min[0])) return { min: [-0.1, 0, -0.1], max: [0.1, 0.2, 0.1] }
  return { min, max }
}

// ------------------------------------------------------------------------------ recipes

/** How a thing behaves, from what its builder returned, with sensible defaults from its size. */
export function metaOf(returned: unknown, bounds: Recipe['bounds'], notes: string[]): ItemMeta {
  const r = (returned && typeof returned === 'object' ? returned : {}) as Record<string, unknown>
  const w = bounds.max[0] - bounds.min[0]
  const h = bounds.max[1] - bounds.min[1]
  const d = bounds.max[2] - bounds.min[2]
  const big = Math.max(w, h, d)
  const carry = r.carry === 'hand' || r.carry === 'hug' || r.carry === 'no' ? r.carry : big < 0.6 ? 'hand' : big < 1.3 ? 'hug' : 'no'
  if (r.carry !== undefined && r.carry !== carry) notes.push(`carry ${JSON.stringify(r.carry)} is not hand, hug or no`)
  const wear = r.wear === undefined || r.wear === null ? null : SLOTS.includes(r.wear as Slot) ? (r.wear as Slot) : null
  if (r.wear !== undefined && r.wear !== null && wear === null) notes.push(`wear ${JSON.stringify(r.wear)} is not a slot`)
  return {
    carry,
    ride: r.ride === true,
    sit: r.sit === true || r.ride === true,
    wear,
    bouncy: Math.max(0, Math.min(1, num(r.bouncy, 0.3))),
    solid: typeof r.solid === 'boolean' ? r.solid : carry === 'no' && Math.min(w, d) > 0.3 && wear === null,
  }
}

/** Words that name food, whole: short ones a longer word must not be mistaken for ('pear' is no 'pearl'). */
const FOOD_WORDS = new Set(['bun', 'pie', 'egg', 'eggs', 'corn', 'rice', 'peas', 'pear', 'plum', 'fig', 'jam', 'taco', 'cake', 'food', 'meal', 'snack', 'treat', 'fruit', 'pulla', 'nakki', 'lettu', 'riisi', 'herne', 'ruoka', 'eväs', 'muna'])
/** Beginnings of words that name food, in English and Finnish (the Finnish with their endings: 'makkaran', 'kakun'). */
const FOOD_STEMS = [
  'apple', 'banana', 'cupcake', 'muffin', 'cookie', 'biscuit', 'bread', 'sandwich', 'pizza', 'sausage', 'hotdog', 'burger', 'fries', 'candy', 'sweets', 'lollipop',
  'chocolate', 'icecream', 'carrot', 'cucumber', 'tomato', 'cherr', 'strawberr', 'berry', 'berries', 'grape', 'melon', 'donut', 'doughnut', 'pancake', 'waffle',
  'cheese', 'soup', 'porridge', 'cereal', 'popcorn', 'pretzel', 'noodle', 'spaghetti', 'pasta', 'meatball', 'marshmallow', 'jelly', 'pudding', 'yogurt', 'yoghurt', 'snacks',
  'vegetable', 'potato', 'lemon', 'peach', 'mango', 'pineapple', 'kiwi', 'omena', 'omppu', 'banaani', 'kakku', 'kakun', 'kakkua', 'keksi', 'keksin', 'leipä',
  'leivä', 'voileip', 'makkara', 'hampurilai', 'ranskal', 'karkki', 'karki', 'tikkari', 'suklaa', 'jäätelö', 'porkkan', 'kurkku', 'tomaat', 'päärynä',
  'luumu', 'kirsik', 'mansik', 'marja', 'mustik', 'puoluk', 'vadelm', 'rypäle', 'meloni', 'piirak', 'piiras', 'munkki', 'donitsi', 'pannukak', 'vohvel',
  'juusto', 'keitto', 'puuro', 'nuudel', 'spaget', 'lihapull', 'hattara', 'vaahtokark', 'hyytelö', 'vanuka', 'jogurt', 'herkku', 'hedelm', 'vihann', 'maissi',
  'peruna', 'sitruun', 'persik', 'ananas', 'eväät',
]
const POISON_STEMS = ['poison', 'toadstool', 'myrkky', 'myrkyl', 'kärpässien']

/** Food guessed from a thing's names when its builder did not say: a poison apple is poison, a cake or a sausage yummy, anything else none. */
export function guessFood(names: readonly string[]): Food | null {
  const words = names.flatMap((n) => [n.toLowerCase().replace(/[\s_-]+/g, ''), ...n.toLowerCase().split(/[^a-zäöå]+/)]).filter((w) => w !== '')
  const starts = (stems: readonly string[]) => words.some((w) => stems.some((s) => w.startsWith(s)))
  if (starts(POISON_STEMS)) return 'poison'
  return words.some((w) => FOOD_WORDS.has(w)) || starts(FOOD_STEMS) ? 'yummy' : null
}

/** What a thing is for, from what its builder returned: food (guessed from its names when not given), hot or cold, soft. */
export function traitsOf(returned: unknown, names: readonly string[], notes: string[]): ItemTraits {
  const r = (returned && typeof returned === 'object' ? returned : {}) as Record<string, unknown>
  const food = FOODS.includes(r.food as Food) ? (r.food as Food) : guessFood(names)
  if (r.food !== undefined && r.food !== null && !FOODS.includes(r.food as Food)) notes.push(`food ${JSON.stringify(r.food)} is not yummy, yucky or poison`)
  const temp = TEMPS.includes(r.temp as Temp) ? (r.temp as Temp) : null
  if (r.temp !== undefined && r.temp !== null && temp === null) notes.push(`temp ${JSON.stringify(r.temp)} is not hot or cold`)
  return { food, temp, soft: r.soft === true }
}

/** Anchors every thing has, where its builder did not say: 'top', 'seat' and 'hand'. */
function defaultAnchors(anchors: Recipe['anchors'], bounds: Recipe['bounds'], meta: ItemMeta) {
  const cx = (bounds.min[0] + bounds.max[0]) / 2
  const cz = (bounds.min[2] + bounds.max[2]) / 2
  const out = { ...anchors }
  out.top ??= { at: [cx, bounds.max[1], cz], part: null }
  out.seat ??= { at: [cx, bounds.max[1], cz], part: null }
  const grip = meta.wear === 'hand' ? bounds.min[1] + (bounds.max[1] - bounds.min[1]) * 0.2 : (bounds.min[1] + bounds.max[1]) / 2
  out.hand ??= { at: [cx, grip, cz], part: null }
  return out
}

/**
 * Runs a builder in a fresh kit. Throws whatever the builder throws; everything else is forgiven
 * and noted. `names` are what the thing is called (its id, names and calls), for a guess at
 * whether it is food when the builder did not say.
 */
export function buildRecipe(build: (m: Kit) => unknown, names: readonly string[]): { recipe: Recipe; notes: string[] } {
  const kit = new Kit()
  const returned = build(kit)
  if (kit.shapes.length === 0) throw new Error('the model has no shapes')
  const bounds = boundsOf(kit.shapes, kit.parts)
  const meta = metaOf(returned, bounds, kit.notes)
  const traits = traitsOf(returned, names, kit.notes)
  return { recipe: { shapes: kit.shapes, parts: kit.parts, anchors: defaultAnchors(kit.anchors, bounds, meta), meta, traits, bounds }, notes: kit.notes }
}

/** A recipe from the interpreter's quick draft, so the thing can appear before its real model is designed. */
export function roughRecipe(shapes: RoughShape[], meta: Partial<ItemMeta & ItemTraits>, names: readonly string[]): Recipe {
  const { recipe } = buildRecipe((m) => {
    for (const s of shapes.slice(0, 12)) {
      const [x = 0.3, y = 0.3, z = 0.3] = (Array.isArray(s.size) ? s.size : []).map((v) => dim(v, 0.3))
      const opts = { at: Array.isArray(s.at) ? s.at : [0, y / 2, 0], color: s.color }
      if (s.shape === 'box') m.box(x, y, z, opts)
      else if (s.shape === 'sphere') m.sphere(0.5, { ...opts, scale: [x, y, z] })
      else if (s.shape === 'cone') m.cylinder(0, x / 2, y, { ...opts, scale: [1, 1, z / x] })
      else m.cylinder(x / 2, x / 2, y, { ...opts, scale: [1, 1, z / x] })
    }
    if (shapes.length === 0) m.box(0.4, 0.4, 0.4, { at: [0, 0.2, 0], color: '#c9b3f2' })
    return meta
  }, names)
  return recipe
}
