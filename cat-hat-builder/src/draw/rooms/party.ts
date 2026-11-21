import { FRIENDS } from '../../game/catalog'
import { FLOOR_BAND } from '../../game/layout'
import type { Look } from '../../game/model'
import { HEAD, MOUTH, drawRig, handAt, inRig, mitten, mixRig, posed, type Rig } from '../builder'
import {
  BOX,
  C,
  INK,
  MATERIAL_LOOK,
  TAU,
  arch,
  blob,
  box,
  circlePath,
  clamp01,
  detail,
  groundShadow,
  heartPath,
  ink,
  loop,
  lw,
  mix,
  part,
  roundRectPath,
  shine,
  smooth,
  sparkle,
  sparklePath,
  starPath,
  tube,
  type Faces,
  type Weight,
} from '../look'
import type { FloorDraw, ItemDraw, ThemeArt, WallDraw } from './types'

/**
 * The party rooms: disco, birthday, music, crafts. Each theme's wallpaper (four colourings),
 * floor band (four colourings), window glow and its five items.
 *
 * Disco: a deep violet wall of mirror-tile dots with coloured light spots sweeping over it, a
 * light-up dance floor, the mirror ball, a neon star, a thumping speaker, a friend dancing
 * and a DJ desk with turning records. Birthday: balloons on the wall and on the ceiling, a
 * striped floor, bunting, a cake whose candles blow out and light again, a friend in a party
 * hat with a party blower, and a pile of gifts. Music: notes on the wall, a floor of piano
 * keys, a mobile of note lamps, a guitar, a drum kit that drums by itself, a friend singing
 * and a toy piano. Crafts: paint splats on the wall, a painted wooden floor, a paper chain, a
 * painting, an easel that paints a new picture on every tap, a friend painting and a table of
 * crayons and glitter.
 *
 * Walls and floors are backdrops (no ink, one tone-on-tone motif in big shapes over a border
 * cut in the theme's own way); the items
 * are inked toys, each with one clear funny reaction that settles within 1.5 s and comes back
 * to its idle look, so the renderer's bake (time 0, never tapped) never jumps.
 */

// ---------------------------------------------------------------------------------------
// The palette

/**
 * Each theme's four wallpapers: the wall, its motif one tone off it, and the border along its
 * bottom in a friendly second colour (disco's is a deeper tone with a row of bulbs on it).
 * Disco is the one dark theme.
 */
const WALLS = {
  disco: [
    { base: '#3B2A86', motif: '#5040A8', border: '#2B1E68', bulb: '#8C78DE' },
    { base: '#26367F', motif: '#394DA0', border: '#1B2862', bulb: '#7088DA' },
    { base: '#6A2470', motif: '#843890', border: '#4F1754', bulb: '#C676CC' },
    { base: '#1E5266', motif: '#2D6C86', border: '#143D4D', bulb: '#5FB3CF' },
  ],
  birthday: [
    { base: '#FFB6D5', motif: '#FFD0E4', border: '#FFE39A' },
    { base: '#A9D8FF', motif: '#C8E7FF', border: '#FFC2DD' },
    { base: '#FFE39A', motif: '#FFEEC1', border: '#B9EBD2' },
    { base: '#B5EBCF', motif: '#D0F4E1', border: '#D8C8F5' },
  ],
  music: [
    { base: '#FF9F73', motif: '#FFBB98', border: '#FFD38A' },
    { base: '#90B2F4', motif: '#AFC8F8', border: '#CDBAF5' },
    { base: '#FFCC66', motif: '#FFDC90', border: '#FFA97E' },
    { base: '#7FD3B3', motif: '#A1E0C8', border: '#FFE08A' },
  ],
  crafts: [
    { base: '#FFF2D6', motif: '#F9DFAE', border: '#BFE3F5' },
    { base: '#DDEEFF', motif: '#C1DFFA', border: '#FFD9A6' },
    { base: '#FFE3EC', motif: '#FAC8D8', border: '#CDEFC0' },
    { base: '#E6F4D4', motif: '#CDE7B2', border: '#FFD3E2' },
  ],
} as const

/** The light spots sweeping over the disco wall: the mirror ball's light, see-through. */
const SPOTS = ['rgba(255, 122, 182, 0.3)', 'rgba(92, 200, 255, 0.3)', 'rgba(255, 225, 77, 0.26)', 'rgba(110, 230, 140, 0.26)'] as const
/** The dance floor's four colourings: the grout between the tiles and the three colours the tiles chase through. */
const DISCO_FLOORS = [
  { grout: '#2A1D66', tiles: ['#E57DB8', '#6FA6EE', '#EBC65A'] },
  { grout: '#1B2860', tiles: ['#58C4D9', '#AE7DE6', '#7ED69A'] },
  { grout: '#4A1A50', tiles: ['#F29A5C', '#E46FA5', '#EED35E'] },
  { grout: '#163E4C', tiles: ['#6ED4BE', '#F08FB5', '#9AB8F3'] },
] as const
/** The birthday floor's candy stripes: the floor, its stripes and the front edge. */
const BIRTHDAY_FLOORS = [
  { a: '#F18AB3', b: '#FBB8D2', edge: '#D46A98' },
  { a: '#7EB2EE', b: '#B3D3F7', edge: '#5E93D4' },
  { a: '#FFB257', b: '#FFD39C', edge: '#E08F38' },
  { a: '#82CF91', b: '#B6E6BF', edge: '#60B070' },
] as const
/** The music floor's piano keys: the keys, the gaps between them and the short sharp keys. */
const MUSIC_FLOORS = [
  { key: '#FFF4E2', gap: '#E2D0B2', sharp: '#7C6A9C' },
  { key: '#E6F0FF', gap: '#BACBEA', sharp: '#5671B6' },
  { key: '#FFE8F0', gap: '#ECC2D2', sharp: '#B55A86' },
  { key: '#E3F6EB', gap: '#B8DEC9', sharp: '#4E9878' },
] as const
/** The crafts floor's boards: the boards, the seams between them, and the paint dropped on them. */
const CRAFTS_FLOORS = [
  { board: '#EBCF9F', seam: '#D3B07A' },
  { board: '#BFCADB', seam: '#A1AEC4' },
  { board: '#EAB9AC', seam: '#D29B8B' },
  { board: '#C6D9AC', seam: '#A8C18A' },
] as const
const DROPS = ['#F58C8C', '#7FB3F0', '#F2CB5E', '#86D494'] as const

/** The colour each theme's windows glow at Good night. */
const GLOW = { disco: '#E9A8FF', birthday: '#FFC9DF', music: '#FFD49A', crafts: '#FFEAA8' } as const

/** The items' own colours beyond look.ts. */
const PARTY = {
  silver: '#C9D2E3',
  silverLight: '#EEF2F8',
  silverMid: '#AEB9CC',
  silverDark: '#7D899E',
  cone: '#2A2E3B',
  record: '#2A2E3B',
  groove: '#4A5068',
  phones: '#4AA8FF',
  string: '#FFF4DC',
  pin: '#FF5A5A',
  smoke: '#ECEEF3',
  flame: '#FFC21A',
  flameCore: '#FFF3B0',
  hat: '#4AA8FF',
  hatDot: '#FFD93A',
  pompom: '#FFFFFF',
  blower: '#FF5C8A',
  blowerTip: '#FFD93A',
  spring: '#B6C0CF',
  starGold: '#FFD93A',
  wood: '#E8A85C',
  woodDark: '#B5733A',
  guitar: '#F2843A',
  guitarHole: '#5B3A26',
  neck: '#8C5A34',
  head: '#5B3A26',
  drum: '#E8443A',
  skin: '#FFF4DC',
  cymbal: '#FFD860',
  cymbalDark: '#DB9A00',
  key: '#FFFFFF',
  keyLit: '#FFD93A',
  sharp: '#2A2E3B',
  sheet: '#FFFFFF',
  mic: '#6B778C',
  micGrip: '#2A2E3B',
  micRing: '#FF5C8A',
  canvas: '#FFFFFF',
  paintBrown: '#5B3A26',
  beret: '#E8443A',
  glitter: '#C9A8F0',
  lid: '#FF7AB6',
  scissors: '#FF8A1F',
  paper: '#FFFFFF',
} as const

/** Made things' faces for the items: a front, a lit top and a dark right side. */
const FACES = {
  speaker: { face: '#6A3EB8', top: '#8E5CE0', side: '#4E2A92' },
  desk: { face: '#FF6FAE', top: '#FF9CC8', side: '#D9478A' },
  stand: { face: '#F5F3EC', top: '#FFFFFF', side: '#CFCBBE' },
  pinkTier: { face: '#FF8FBA', top: '#FFFFFF', side: '#E06C9A' },
  vanillaTier: { face: '#FFE3A8', top: '#FFB8D4', side: '#E8C27E' },
  red: { face: '#FF5A5A', top: '#FF8A80', side: '#D93A3A' },
  green: { face: '#4FD36A', top: '#84E394', side: '#2FA84A' },
  piano: { face: '#E8443A', top: '#EE7A5E', side: '#B52E26' },
  keys: { face: '#FFFFFF', top: '#FFFFFF', side: '#CFCBBE' },
  frame: MATERIAL_LOOK.planks,
} as const satisfies Record<string, Faces>

/** The light beams the mirror ball throws, see-through. */
const BEAMS = ['rgba(255, 122, 182, 0.32)', 'rgba(92, 200, 255, 0.32)', 'rgba(255, 225, 77, 0.3)', 'rgba(110, 230, 140, 0.3)', 'rgba(190, 150, 255, 0.32)'] as const
/** The neon star's tube colours, lit one at a time, the soft light each throws on the wall round it, and the light tint it fills the star with. */
const NEON = [
  { tube: '#FF5CB8', glow: 'rgba(255, 92, 184, 0.24)', fill: '#FFE3F2' },
  { tube: '#FFE14D', glow: 'rgba(255, 225, 77, 0.24)', fill: '#FFF6C2' },
  { tube: '#5CE1FF', glow: 'rgba(92, 225, 255, 0.24)', fill: '#D9F6FF' },
] as const
/** The note lamps' colours, unlit and lit. */
const LAMP_COLOURS = [
  { off: '#FFE99A', on: '#FFD93A' },
  { off: '#FFC2DD', on: '#FF7AB6' },
  { off: '#B5ECFA', on: '#4AD3FF' },
] as const
/** The painting on the wall: its sky and hill, and the flower and sun in it. */
const PICTURE = { sky: '#BDE5F8', hill: '#6CCB7F', sun: '#FFD93A', stem: '#3FB45A', petal: '#FF7AB6', middle: '#FFD93A' } as const
/** Poster paint: the easel's pictures, the painter's palette and drops, the crayons. */
const PAINT = { yellow: '#FFC93A', orange: '#FF9F3A', green: '#4FD36A', red: '#E8443A', blue: '#2E6BE6', ginger: '#FF9F3A', pink: '#FF7AB6' } as const

/** The friends living in these rooms: fixed looks from FRIENDS, picked to stand out on their theme's walls. */
const WHO = { dancer: 6, partyKid: 1, singer: 4, painter: 3 } as const
/** The friends are drawn this much smaller than the builder rig, so with a party hat, a beret or a hop they keep inside the floor slot. */
const FRIEND_SCALE = 0.9

// ---------------------------------------------------------------------------------------
// Shared bits

/** 0 up to 1 and back to 0 as u runs 0 to 1, quick to grow and slow to shrink: a puff's, a sparkle's or a bit of confetti's size over its life. */
const swell = (u: number) => (u <= 0 || u >= 1 ? 0 : u < 0.25 ? smooth(0, 0.25, u) : 1 - smooth(0.25, 1, u))

/**
 * Which tap `play` belongs to, as a number that steps by one every TAP_SLOT seconds of tap
 * time. Items get no tap count, so this is their only memory: the balloon that pops and the
 * picture the easel paints follow it, and a child tapping every few seconds sees them cycle.
 */
const TAP_SLOT = 2
const tapSlot = (t: number, play: number, n: number) => step(t - play + 1e-6, TAP_SLOT, n)

/** Which of `n` things is on at time t when they take turns `every` seconds: lamps, colours, beats. Never negative, whatever t is. */
const step = (t: number, every: number, n: number) => ((Math.floor(t / every) % n) + n) % n

/** A number from 0 to 1 that looks random but is the same for the same (i, k): which way a bit of confetti flies. */
function rand(i: number, k: number) {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453
  return x - Math.floor(x)
}

/** The current path as one inked silhouette with no lines inside (look.ts blob does the same for circles): an ink backing stroked wide, then the fill. */
function silhouette(ctx: CanvasRenderingContext2D, colour: string, weight: Weight) {
  ctx.lineJoin = 'round'
  ctx.lineWidth = lw(weight) * 2
  ctx.strokeStyle = INK
  ctx.stroke()
  ctx.fillStyle = colour
  ctx.fill()
}

/**
 * The path of a music note `s` tall, origin at the top of its stem: a quaver (one head, a
 * stem, a flag) or a pair joined by a beam. Every piece runs clockwise, so filled as one path
 * they make one shape.
 */
function notePath(ctx: CanvasRenderingContext2D, s: number, beamed: boolean) {
  const tilt = -0.4
  const head = (x: number, y: number) => {
    ctx.moveTo(x + 0.25 * s * Math.cos(tilt), y + 0.25 * s * Math.sin(tilt))
    ctx.ellipse(x, y, 0.25 * s, 0.18 * s, tilt, 0, TAU)
  }
  ctx.beginPath()
  head(-0.17 * s, 0.82 * s)
  ctx.rect(-0.1 * s, 0, 0.1 * s, 0.82 * s)
  if (beamed) {
    const dx = 0.55 * s
    const dy = -0.12 * s
    head(dx - 0.17 * s, 0.82 * s + dy)
    ctx.rect(dx - 0.1 * s, dy, 0.1 * s, 0.82 * s)
    ctx.moveTo(-0.1 * s, 0)
    ctx.lineTo(dx, dy)
    ctx.lineTo(dx, dy + 0.17 * s)
    ctx.lineTo(-0.1 * s, 0.17 * s)
    ctx.closePath()
  } else {
    ctx.moveTo(-0.02 * s, 0)
    ctx.bezierCurveTo(0.05 * s, 0.2 * s, 0.4 * s, 0.24 * s, 0.27 * s, 0.62 * s)
    ctx.bezierCurveTo(0.3 * s, 0.38 * s, 0.1 * s, 0.34 * s, -0.02 * s, 0.34 * s)
    ctx.closePath()
  }
}

/** An inked quaver `s` tall in `colour` with its stem's top at (x, y): the notes the singer sings and the lamps of the note mobile. */
function drawNote(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, colour: string) {
  if (s < 0.01) return
  ctx.save()
  ctx.translate(x, y)
  notePath(ctx, s, false)
  silhouette(ctx, colour, 'detail')
  ctx.restore()
}

/** How far a thing thrown out with drag has gone `age` seconds after it, as a fraction of its whole reach. */
const thrown = (age: number, drag: number) => 1 - Math.exp(-age / drag)

/**
 * A handful of `n` bits thrown out of (x, y) `age` seconds ago, each its own way within
 * `spread` radians of `aim` (radians right of straight up), reaching up to `reach` metres
 * before the air stops them, falling under `fall` m/s squared, tumbling, and shrinking away
 * over `life`: confetti, glitter, paint drops. `seed` keeps two sprays from throwing alike.
 */
function spray(ctx: CanvasRenderingContext2D, age: number, x: number, y: number, n: number, aim: number, spread: number, reach: number, fall: number, life: number, size: number, kind: 'confetti' | 'glitter' | 'drop', colours: readonly string[], seed: number) {
  if (age < 0 || age >= life) return
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + aim + spread * (2 * rand(i, seed) - 1)
    const r = reach * (0.55 + 0.45 * rand(i, seed + 1)) * thrown(age, 0.22)
    const px = x + Math.cos(a) * r
    const py = y + Math.sin(a) * r + fall * age * age * 0.5
    const s = size * swell(clamp01(age / life + 0.02 * i))
    if (s < 0.004) continue
    const colour = colours[i % colours.length]!
    if (kind === 'glitter') sparkle(ctx, px, py, s, colour)
    else if (kind === 'drop') {
      circlePath(ctx, px, py, s / 2)
      part(ctx, colour, 'detail')
    } else {
      ctx.save()
      ctx.translate(px, py)
      ctx.rotate(a * 3 + age * (4 + 3 * rand(i, seed + 2)))
      ctx.beginPath()
      ctx.rect(-s / 2, -s / 4, s, s / 2)
      part(ctx, colour, 'detail')
      ctx.restore()
    }
  }
}

/** The wallpapers' motif grid: one every MOTIF.x by MOTIF.y metres, alternate rows shifted half a step, so a 2.4 m cell holds about five. */
const MOTIF = { x: 1.0, y: 0.78, x0: 0.42, y0: 0.38 }

/**
 * A wallpaper: `base` all over, then `motif` (drawn about its origin, about 0.3 m across, in
 * `tone`, which it finds set as both the fill and the stroke) on the grid, each turned a
 * little its own way. `i` numbers the motif so it can vary; `base` is there for the marks
 * cut back into it.
 */
function motifWall(ctx: CanvasRenderingContext2D, w: number, h: number, base: string, tone: string, motif: (ctx: CanvasRenderingContext2D, i: number, base: string) => void) {
  ctx.save()
  ctx.fillStyle = base
  ctx.fillRect(0, 0, w, h)
  for (let row = 0; MOTIF.y0 + row * MOTIF.y < h + 0.2; row++) {
    const shift = (row % 2) * MOTIF.x * 0.5
    for (let col = -1; MOTIF.x0 + col * MOTIF.x + shift < w + 0.3; col++) {
      const i = col * 3 + row * 7 + 30
      ctx.save()
      ctx.translate(MOTIF.x0 + col * MOTIF.x + shift, MOTIF.y0 + row * MOTIF.y)
      ctx.rotate(((i % 5) - 2) * 0.14)
      ctx.fillStyle = tone
      ctx.strokeStyle = tone
      motif(ctx, i, base)
      ctx.restore()
    }
  }
  ctx.restore()
}

/** The border along a wallpaper's bottom: its top edge is this far above the wall's bottom (the floor band covers the lowest 0.2 m of it). */
const BORDER = 0.5

/**
 * The border band along the bottom of a wall `w` x `h`, in `colour`, its top edge cut in the
 * theme's own way: round scallops (disco), piped cream in big and small swirls (birthday), a
 * sound wave (music) or pinking-shear zigzags (crafts).
 */
function wallBorder(ctx: CanvasRenderingContext2D, w: number, h: number, colour: string, edge: 'scallop' | 'cream' | 'wave' | 'zigzag') {
  const y = h - BORDER
  ctx.beginPath()
  ctx.moveTo(0, h)
  ctx.lineTo(0, y)
  if (edge === 'scallop') for (let x = 0; x < w; x += 0.26) ctx.arc(x + 0.13, y, 0.13, Math.PI, 0, false)
  else if (edge === 'cream')
    for (let x = 0, i = 0; x < w; i++) {
      const r = i % 2 === 0 ? 0.1 : 0.06
      ctx.arc(x + r, y + 0.02, r, Math.PI, 0, false)
      x += 2 * r
    }
  else if (edge === 'wave') for (let x = 0; x <= w + 0.05; x += 0.05) ctx.lineTo(x, y + 0.045 * Math.sin((x / 0.42) * TAU))
  else for (let x = 0, i = 0; x <= w + 0.09; x += 0.09, i++) ctx.lineTo(x, y + (i % 2) * 0.08)
  ctx.lineTo(w + 0.3, y)
  ctx.lineTo(w + 0.3, h)
  ctx.closePath()
  ctx.fillStyle = colour
  ctx.fill()
}

// ---------------------------------------------------------------------------------------
// Friends: the builder rig (draw/builder.ts) in a fixed outfit, with props in its hands.

/** A turn seen from the side never goes flatter than this, so the figure never vanishes edge-on. */
const EDGE_ON = 0.08

/**
 * A friend in `rig`, FRIEND_SCALE of the rig's size, turned by `turn` (1 facing right, -1
 * facing left, between for a spin), on a ground shadow. `props` draws what the friend holds
 * or wears, once behind the figure and once in front, in the figure's own metres (inRig
 * gives its frames).
 */
function drawFriend(ctx: CanvasRenderingContext2D, look: Look, rig: Rig, turn: number, props: (layer: 'behind' | 'front') => void) {
  ctx.save()
  ctx.scale(FRIEND_SCALE, FRIEND_SCALE)
  groundShadow(ctx, 0.5 * clamp01(1 + rig.lift * 1.5))
  ctx.scale(turn < 0 ? Math.min(-EDGE_ON, turn) : Math.max(EDGE_ON, turn), 1)
  props('behind')
  drawRig(ctx, look, rig)
  props('front')
  ctx.restore()
}

/** A friend's reaction: 0 before the tap, up to 1 by `inAt`, held, and eased back to 0 between `outAt` and `doneAt`. */
const held = (play: number, inAt: number, outAt: number, doneAt: number) => (play < 0 ? 0 : smooth(0, inAt, play) * (1 - smooth(outAt, doneAt, play)))

// ---------------------------------------------------------------------------------------
// Disco

/** A mirror-ball dot: a round ball with its tile seams cut back in the wall's colour, and a sparkle beside it, one side or the other. */
function mirrorDot(ctx: CanvasRenderingContext2D, i: number, base: string) {
  const r = 0.16
  circlePath(ctx, 0, 0, r)
  ctx.fill()
  sparklePath(ctx, i % 2 === 0 ? 0.21 : -0.21, -0.15, 0.13)
  ctx.fill()
  ctx.save()
  circlePath(ctx, 0, 0, r)
  ctx.clip()
  ctx.beginPath()
  for (const y of [-0.08, 0, 0.08]) {
    ctx.moveTo(-r, y)
    ctx.lineTo(r, y)
  }
  for (const k of [0.35, 0.8]) {
    ctx.moveTo(0, -r)
    ctx.ellipse(0, 0, k * r, r, 0, -Math.PI / 2, Math.PI * 1.5)
  }
  ctx.moveTo(0, -r)
  ctx.lineTo(0, r)
  ctx.lineWidth = 0.014
  ctx.strokeStyle = base
  ctx.stroke()
  ctx.restore()
}

/** The light spots' slow sweep: each goes round its own oval over SPOT_SWEEP seconds or so. */
const SPOT_SWEEP = 11

const discoWall: WallDraw = (ctx, w, h, t, variant) => {
  const c = WALLS.disco[variant]
  motifWall(ctx, w, h, c.base, c.motif, mirrorDot)
  wallBorder(ctx, w, h, c.border, 'scallop')
  // A row of marquee bulbs along the border.
  ctx.save()
  ctx.beginPath()
  for (let x = 0.13; x < w; x += 0.26) {
    ctx.moveTo(x + 0.035, h - BORDER + 0.1)
    ctx.arc(x, h - BORDER + 0.1, 0.035, 0, TAU)
  }
  ctx.fillStyle = c.bulb
  ctx.fill()
  // Coloured light spots from the mirror ball, sweeping slowly over the whole wall.
  const n = Math.max(3, Math.round(w * 1.6))
  for (let i = 0; i < n; i++) {
    const a = (TAU * t) / (SPOT_SWEEP + i) + i * 2.1
    const x = w * (0.5 + 0.42 * Math.sin(a + i * 1.3))
    const y = h * (0.42 + 0.28 * Math.sin(a * 1.3 + i * 0.7))
    ctx.beginPath()
    ctx.ellipse(x, y, 0.2, 0.13, 0.3 * Math.sin(a), 0, TAU)
    ctx.fillStyle = SPOTS[i % SPOTS.length]!
    ctx.fill()
  }
  ctx.restore()
}

/** The dance floor's tiles chase through their colours one step every DANCE_BEAT seconds: about one change a second per tile. */
const DANCE_BEAT = 0.8

const discoFloor: FloorDraw = (ctx, w, t, variant) => {
  const c = DISCO_FLOORS[variant]
  const beat = step(t, DANCE_BEAT, c.tiles.length)
  const tile = 0.27
  const gap = 0.022
  const rowH = FLOOR_BAND / 2
  ctx.save()
  ctx.fillStyle = c.grout
  ctx.fillRect(0, 0, w, FLOOR_BAND)
  for (let row = 0; row < 2; row++)
    for (let i = 0; (i - row * 0.5) * tile < w; i++) {
      ctx.fillStyle = c.tiles[(i + row * 2 + beat) % c.tiles.length]!
      ctx.fillRect(i * tile + gap / 2 - row * tile * 0.5, row * rowH + gap / 2, tile - gap, rowH - gap)
    }
  ctx.restore()
}

/** The mirror ball: its centre under the ceiling, its radius, its facets round and top to bottom, and one turn every `turn` seconds. */
const BALL = { y: 0.29, r: 0.17, cols: 16, rows: 8, turn: 9 } as const

/**
 * The mirror ball on its chain: tiled facets turning slowly, a few glinting in turn, and five
 * coloured beams turning with it (the wall's spots are where they land). A tap spins it half
 * a turn on (its facets' tones and its beams repeat every half turn, so it looks the same
 * after) and swirls sparkles round it.
 */
const discoBall: ItemDraw = (ctx, t, play) => {
  const fine = detail(0.6) !== 'S'
  const extra = play >= 0 ? Math.PI * smooth(0, 1.4, play) : 0
  const rot = (TAU * t) / BALL.turn + extra
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  // The beams, the ones turning up into the ceiling shrinking away.
  for (let i = 0; i < BEAMS.length; i++) {
    const a = rot * 0.8 + (i * TAU) / BEAMS.length
    const len = 0.3 * smooth(-0.25, 0.35, Math.sin(a))
    if (len < 0.02) continue
    ctx.beginPath()
    ctx.moveTo(0, BALL.y)
    ctx.lineTo(Math.cos(a - 0.09) * len, BALL.y + Math.sin(a - 0.09) * len)
    ctx.lineTo(Math.cos(a + 0.09) * len, BALL.y + Math.sin(a + 0.09) * len)
    ctx.closePath()
    ctx.moveTo(Math.cos(a) * len + 0.045, BALL.y + Math.sin(a) * len)
    ctx.ellipse(Math.cos(a) * len, BALL.y + Math.sin(a) * len, 0.045, 0.03, 0, 0, TAU)
    ctx.fillStyle = BEAMS[i]!
    ctx.fill()
  }
  // The cap on the ceiling and the chain.
  ctx.beginPath()
  ctx.moveTo(0, 0.02)
  ctx.lineTo(0, BALL.y - BALL.r)
  tube(ctx, 0.014, PARTY.silverMid)
  roundRectPath(ctx, -0.05, -0.005, 0.1, 0.035, 0.012)
  part(ctx, PARTY.silverDark, 'line')
  // The ball, its facets clipped to it.
  circlePath(ctx, 0, BALL.y, BALL.r)
  part(ctx, PARTY.silver, 'line')
  ctx.save()
  circlePath(ctx, 0, BALL.y, BALL.r)
  ctx.clip()
  const rows = fine ? BALL.rows : 4
  const cols = fine ? BALL.cols : 8
  const repeat = cols / 2
  const half = Math.PI / cols
  const glints: [number, number][] = []
  const at = (lon: number, lat: number) => [BALL.r * Math.cos(lat) * Math.sin(lon), BALL.y + BALL.r * Math.sin(lat)] as const
  for (let j = 0; j < rows; j++) {
    const la0 = -Math.PI / 2 + (j * Math.PI) / rows
    const la1 = la0 + Math.PI / rows
    for (let k = 0; k < cols; k++) {
      // The facet's middle, wrapped to -pi..pi; the back half of the ball is hidden.
      const m = ((((rot + (k + 0.5) * 2 * half + Math.PI) % TAU) + TAU) % TAU) - Math.PI
      if (Math.cos(m) <= 0) continue
      const s0 = Math.max(-Math.PI / 2, m - half)
      const s1 = Math.min(Math.PI / 2, m + half)
      const kk = k % repeat
      // A few facets glint in turn, each about once every few seconds.
      const glint = fine && (j * 5 + kk * 3) % 7 === 2 && loop(t, 2.6, (j * 0.37 + kk * 0.21) % 1) < 0.14
      const tone = glint ? C.white : [PARTY.silver, PARTY.silverLight, PARTY.silverMid, PARTY.silver][(j * 5 + kk * 3) % 4]!
      const [ax, ay] = at(s0, la0)
      const [bx, by] = at(s1, la0)
      const [cx, cy] = at(s1, la1)
      const [dx, dy] = at(s0, la1)
      ctx.beginPath()
      ctx.moveTo(ax, ay)
      ctx.lineTo(bx, by)
      ctx.lineTo(cx, cy)
      ctx.lineTo(dx, dy)
      ctx.closePath()
      ctx.fillStyle = tone
      ctx.fill()
      if (fine) {
        ctx.lineWidth = lw('detail') * 0.8
        ctx.strokeStyle = PARTY.silverDark
        ctx.stroke()
      }
      if (glint) glints.push([(ax + bx + cx + dx) / 4, (ay + by + cy + dy) / 4])
    }
  }
  ctx.restore()
  circlePath(ctx, 0, BALL.y, BALL.r)
  ink(ctx, 'line')
  shine(ctx, 0, BALL.y, BALL.r)
  for (const [gx, gy] of glints) sparkle(ctx, gx, gy, 0.07, C.sparkle)
  // A tap: sparkles swirl out round the ball and shrink away.
  if (play >= 0 && play < 1.6)
    for (let i = 0; i < 8; i++) {
      const a = (i * TAU) / 8 + play * 2.4
      const rr = BALL.r + 0.03 + 0.09 * smooth(0, 0.9, play)
      sparkle(ctx, Math.cos(a) * rr, BALL.y + Math.sin(a) * rr * 0.85, 0.1 * swell(clamp01((play - i * 0.03) / 1.3)), i % 2 ? C.sparkle : C.sparkleWarm)
    }
  ctx.restore()
}

/** The neon star's tube changes colour (NEON) every NEON_EVERY seconds. */
const NEON_EVERY = 2.4
const NEON_Y = 0.025

/** A neon star on the wall: a glowing tube with a white-hot core round a star of light, changing colour every few seconds. A tap zaps it brighter and sparks fly off its five points. */
const neonStar: ItemDraw = (ctx, t, play) => {
  const fine = detail(0.6) !== 'S'
  const c = NEON[step(t, NEON_EVERY, NEON.length)]!
  const zap = play >= 0 && play < 0.8 ? 1 - smooth(0, 0.8, play) : 0
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  starPath(ctx, 0, NEON_Y, 0.3 + 0.03 * zap)
  ctx.fillStyle = c.glow
  ctx.fill()
  starPath(ctx, 0, NEON_Y, 0.24)
  ctx.fillStyle = c.fill
  ctx.fill()
  if (fine) {
    // Two clips holding it to the wall.
    for (const x of [-0.1, 0.1]) {
      roundRectPath(ctx, x - 0.025, -0.11, 0.05, 0.035, 0.01)
      part(ctx, PARTY.silverMid, 'detail')
    }
  }
  starPath(ctx, 0, NEON_Y, 0.24)
  tube(ctx, 0.045, c.tube)
  starPath(ctx, 0, NEON_Y, 0.24)
  ctx.lineWidth = 0.012 + 0.014 * zap
  ctx.strokeStyle = C.white
  ctx.stroke()
  if (fine) {
    sparklePath(ctx, 0.33, -0.17, 0.12)
    tube(ctx, 0.016, c.tube)
  }
  if (play >= 0 && play < 0.9)
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * TAU) / 5
      const rr = 0.25 + 0.07 * smooth(0, 0.5, play)
      sparkle(ctx, Math.cos(a) * rr, NEON_Y + Math.sin(a) * rr, 0.08 * swell(play / 0.9), C.sparkleWarm)
    }
  ctx.restore()
}

/** The speaker's box, standing on two feet; its tweeter and woofer; and the beat it thumps to. */
const SPEAKER = { x: -0.25, y: -0.95, w: 0.46, h: 0.89, d: 0.08, tweeter: -0.77, woofer: -0.37, beat: 0.6 } as const

/** A speaker cone at (x, y): the silver rim, the dark cone pushed out by `push`, and the dust cap with its shine. */
function cone(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, push: number, fine: boolean) {
  circlePath(ctx, x, y, r)
  part(ctx, PARTY.silver, 'line')
  circlePath(ctx, x, y, r * (0.78 + 0.06 * push))
  part(ctx, PARTY.cone, 'detail')
  if (fine) {
    circlePath(ctx, x, y, r * (0.55 + 0.05 * push))
    ctx.lineWidth = lw('detail')
    ctx.strokeStyle = PARTY.groove
    ctx.stroke()
  }
  circlePath(ctx, x, y, r * (0.3 + 0.06 * push))
  part(ctx, PARTY.silver, 'detail')
  shine(ctx, x, y, r * (0.3 + 0.06 * push))
}

/** A tall purple speaker thumping to a beat: its woofer pushes out and rings of sound ripple off it to the right. A tap thumps it hard. */
const speaker: ItemDraw = (ctx, t, play) => {
  const fine = detail(1.15) !== 'S'
  const u = loop(t, SPEAKER.beat, 0)
  const thump = Math.exp(-7 * u)
  const hit = play >= 0 && play < 1.2 ? 1 - smooth(0, 1.2, play) : 0
  const s = SPEAKER
  const cx = s.x + s.w / 2
  ctx.save()
  ctx.lineJoin = 'round'
  groundShadow(ctx, 0.62)
  for (const fx of [s.x + 0.04, s.x + s.w - 0.13]) box(ctx, fx, -0.06, 0.09, 0.06, BOX.asphalt, 0.03, false, true, 'line')
  box(ctx, s.x, s.y, s.w, s.h, FACES.speaker, s.d, true, true, 'line')
  if (fine) {
    // A light on top of the front, changing colour on every beat (under two changes a second).
    circlePath(ctx, cx, s.y + 0.06, 0.022)
    part(ctx, step(t, SPEAKER.beat, 2) === 0 ? C.confetti[1] : C.confetti[3], 'detail')
  }
  cone(ctx, cx, s.tweeter, 0.075, thump * 0.4, fine)
  cone(ctx, cx, s.woofer, 0.165, thump + 2 * hit, fine)
  // Sound rings off the woofer to the right: one per beat, more on a tap.
  ctx.lineCap = 'round'
  for (let i = 0; i < (hit > 0 ? 3 : 1); i++) {
    const k = clamp01(u + i / 3)
    const r = 0.21 + (0.1 + 0.08 * hit) * k
    const span = 0.55 * (1 - k)
    if (span < 0.05) continue
    ctx.beginPath()
    ctx.arc(cx, s.woofer, r, -span, span)
    ink(ctx, 'line')
  }
  ctx.restore()
}

/** The dancer's disco pose: one arm pointing up to the ball, the other on the hip, the hip out. */
const STRIKE: Rig = {
  ...posed('stand', 0),
  lift: -0.02,
  lean: -0.12,
  nod: -0.14,
  thigh: [-0.22, 0.32],
  knee: [0.05, 0.25],
  shoulder: [-0.5, 2.3],
  elbow: [1.9, 0.05],
  tool: null,
  eyes: 'happy',
  mouth: true,
}
/** The dancer's spin takes this long; the pose holds until STRIKE_OUT and has eased back into the dance by STRIKE_DONE. */
const SPIN_FOR = 0.6
const STRIKE_OUT = 1.1
const STRIKE_DONE = 1.5

/** A friend dancing. A tap spins them round once and they strike a disco pose with sparkles, then dance on. */
const dancer: ItemDraw = (ctx, t, play) => {
  const look = FRIENDS[WHO.dancer]!
  const k = held(play, 0.55, STRIKE_OUT, STRIKE_DONE)
  const rig = mixRig(posed('dance', t + 0.31), STRIKE, play >= 0 && play < SPIN_FOR * 0.75 ? 0 : k)
  const turn = play >= 0 && play < SPIN_FOR ? Math.cos(TAU * smooth(0, SPIN_FOR, play)) : 1
  drawFriend(ctx, look, rig, turn, () => {})
  if (k > 0)
    for (let i = 0; i < 3; i++) {
      const u = clamp01((play - 0.5 - i * 0.12) / 0.9)
      sparkle(ctx, [0.3, -0.32, 0.38][i]!, [-1.0, -0.75, -0.55][i]!, 0.14 * swell(u), i === 1 ? C.sparkle : C.sparkleWarm)
    }
}

/** The DJ desk: its body, the deck on top, the two records on the deck and how fast they turn (radians a second). */
const DESK = { x: -0.42, y: -0.64, w: 0.74, h: 0.62, d: 0.1, spin: 3.5 } as const
const DECK = { x: -0.36, y: -0.73, w: 0.64, h: 0.06, d: 0.05 } as const
const RECORDS = [
  { x: -0.17, label: C.confetti[1] },
  { x: 0.13, label: C.confetti[2] },
] as const

/** A pink DJ desk: two records turning on the deck, a screen of bouncing bars, headphones over the corner. A tap scratches the records back and forth. */
const djDesk: ItemDraw = (ctx, t, play) => {
  const fine = detail(1.15) !== 'S'
  const scratch = play >= 0 && play < 0.9 ? 0.9 * Math.sin(play * 16) * (1 - play / 0.9) : 0
  const d = DESK
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  groundShadow(ctx, 0.9)
  box(ctx, d.x, d.y, d.w, d.h, FACES.desk, d.d, true, true, 'line')
  // The screen of bars, bouncing to the music.
  const sx = d.x + 0.08
  const sw = d.w - 0.16
  roundRectPath(ctx, sx, -0.5, sw, 0.26, 0.03)
  part(ctx, PARTY.record, 'line')
  const bars = fine ? 6 : 4
  const bw = (sw - 0.06) / bars
  for (let i = 0; i < bars; i++) {
    const bh = 0.04 + 0.15 * (0.5 + 0.5 * Math.sin(TAU * (t * (0.9 + 0.23 * i) + i * 0.37)))
    ctx.beginPath()
    ctx.rect(sx + 0.03 + i * bw + bw * 0.15, -0.27 - bh, bw * 0.7, bh)
    ctx.fillStyle = C.rainbow[i % C.rainbow.length]!
    ctx.fill()
  }
  // The deck lying on the top, and the records on it.
  box(ctx, DECK.x + d.d / 2, DECK.y, DECK.w, DECK.h, BOX.asphalt, DECK.d, true, true, 'line')
  for (const [i, r] of RECORDS.entries()) {
    const x = r.x + d.d / 2 + DECK.d / 2
    const y = DECK.y - DECK.d / 2
    ctx.beginPath()
    ctx.ellipse(x, y, 0.13, 0.042, 0, 0, TAU)
    part(ctx, PARTY.record, 'line')
    if (fine) {
      ctx.beginPath()
      ctx.ellipse(x, y, 0.09, 0.029, 0, 0, TAU)
      ctx.lineWidth = lw('detail')
      ctx.strokeStyle = PARTY.groove
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.ellipse(x, y, 0.045, 0.015, 0, 0, TAU)
    ctx.fillStyle = r.label
    ctx.fill()
    // A white mark on the record shows it turning.
    const a = t * DESK.spin * (i === 0 ? 1 : 1.1) + i * 2 + scratch * 3
    ctx.beginPath()
    ctx.moveTo(x + Math.cos(a) * 0.05, y + Math.sin(a) * 0.017)
    ctx.lineTo(x + Math.cos(a) * 0.12, y + Math.sin(a) * 0.039)
    ctx.lineWidth = lw('line')
    ctx.strokeStyle = C.white
    ctx.stroke()
  }
  // Headphones hung over the front right corner.
  const hx = d.x + d.w - 0.1
  ctx.beginPath()
  ctx.arc(hx, d.y + 0.02, 0.085, Math.PI, 0)
  tube(ctx, 0.022, PARTY.phones)
  for (const cx of [hx - 0.085, hx + 0.085]) {
    roundRectPath(ctx, cx - 0.032, d.y + 0.01, 0.064, 0.1, 0.025)
    part(ctx, PARTY.phones, 'line')
  }
  ctx.restore()
}

// ---------------------------------------------------------------------------------------
// Birthday

/** A balloon motif: an oval, its knot and a wavy string, about 0.4 m from top to the string's end. */
function balloonMotif(ctx: CanvasRenderingContext2D) {
  ctx.scale(1.2, 1.2)
  ctx.beginPath()
  ctx.ellipse(0, -0.04, 0.11, 0.14, 0, 0, TAU)
  ctx.moveTo(0, 0.09)
  ctx.lineTo(0.03, 0.13)
  ctx.lineTo(-0.03, 0.13)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(0, 0.13)
  ctx.quadraticCurveTo(0.05, 0.18, 0, 0.23)
  ctx.quadraticCurveTo(-0.05, 0.28, 0.01, 0.32)
  ctx.lineWidth = 0.016
  ctx.lineCap = 'round'
  ctx.stroke()
}

const birthdayFloor: FloorDraw = (ctx, w, t, variant) => {
  void t
  const c = BIRTHDAY_FLOORS[variant]
  const band = FLOOR_BAND
  ctx.save()
  ctx.fillStyle = c.a
  ctx.fillRect(0, 0, w, band)
  ctx.beginPath()
  for (let x = -band; x < w + band; x += 0.2) {
    ctx.moveTo(x, band)
    ctx.lineTo(x + band, 0)
    ctx.lineTo(x + band + 0.08, 0)
    ctx.lineTo(x + 0.08, band)
    ctx.closePath()
  }
  ctx.fillStyle = c.b
  ctx.fill()
  ctx.fillStyle = c.edge
  ctx.fillRect(0, band - 0.035, w, 0.035)
  ctx.restore()
}

/** The three balloons under the ceiling: where each floats, its colour, and the bow their strings are tied with. */
const BALLOONS = [
  { x: 0.02, y: 0.17, colour: C.confetti[3] },
  { x: -0.21, y: 0.21, colour: C.confetti[0] },
  { x: 0.23, y: 0.22, colour: C.confetti[1] },
] as const
const BALLOON = { rx: 0.12, ry: 0.15, bow: { x: 0.0, y: 0.48 } } as const
/** A popped balloon bursts until POP_GONE; its new one floats up and fills out from NEW_FROM to NEW_DONE. */
const POP_GONE = 0.5
const NEW_FROM = 0.55
const NEW_DONE = 1.4

/** One balloon at (x, y), `k` of its size: the oval, its knot, its shine. */
function drawBalloon(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, colour: string) {
  ctx.beginPath()
  ctx.moveTo(x - 0.025 * k, y + BALLOON.ry * k + 0.025 * k)
  ctx.lineTo(x, y + BALLOON.ry * k - 0.01 * k)
  ctx.lineTo(x + 0.025 * k, y + BALLOON.ry * k + 0.025 * k)
  ctx.closePath()
  part(ctx, colour, 'detail')
  ctx.beginPath()
  ctx.ellipse(x, y, BALLOON.rx * k, BALLOON.ry * k, 0, 0, TAU)
  part(ctx, colour, 'line')
  shine(ctx, x, y, BALLOON.rx * k)
}

/** A string from a balloon's knot at (x, y) down to the bow, gently waved. */
function balloonString(ctx: CanvasRenderingContext2D, x: number, y: number, wave: number) {
  const { bow } = BALLOON
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.bezierCurveTo(x + 0.04 + wave, y + 0.08, bow.x - 0.04 - wave, bow.y - 0.1, bow.x, bow.y)
  ink(ctx, 'detail')
}

/**
 * A bunch of three balloons against the ceiling, each bobbing its own way, their strings tied
 * in a bow with curly tails. A tap pops one (a different one tap after tap): it bursts into a
 * spiky star, and a new one floats up from below, filling out as it rises.
 */
const balloons: ItemDraw = (ctx, t, play) => {
  const fine = detail(0.6) !== 'S'
  const popping = play >= 0 && play < NEW_DONE
  const popped = popping ? tapSlot(t, play, BALLOONS.length) : -1
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const spots = BALLOONS.map((b, i) => {
    const bob = 0.012 * Math.sin(TAU * (t / 2.2 + i * 0.31))
    let y = b.y + bob
    let k = 1
    let shown = true
    if (i === popped) {
      if (play < 0.07) k = 1 + 0.15 * (play / 0.07)
      else if (play < NEW_FROM) shown = false
      else {
        const u = smooth(NEW_FROM, NEW_DONE, play)
        y += 0.28 * (1 - u)
        k = mix(0.35, 1, u)
      }
    }
    return { x: b.x + 0.01 * Math.sin(TAU * (t / 2.8 + i * 0.5)), y, k, shown, colour: b.colour }
  })
  // The strings first, behind the balloons and the bow.
  spots.forEach((s, i) => {
    if (s.shown) balloonString(ctx, s.x, s.y + (BALLOON.ry + 0.025) * s.k, 0.02 * Math.sin(TAU * (t / 2.6 + i * 0.4)))
  })
  // Two curly tails under the bow.
  ctx.beginPath()
  const { bow } = BALLOON
  ctx.moveTo(bow.x, bow.y)
  ctx.quadraticCurveTo(bow.x - 0.06, bow.y + 0.04, bow.x - 0.03, bow.y + 0.08)
  ctx.quadraticCurveTo(bow.x + 0.01, bow.y + 0.11, bow.x - 0.04, bow.y + 0.13)
  ctx.moveTo(bow.x, bow.y)
  ctx.quadraticCurveTo(bow.x + 0.06, bow.y + 0.05, bow.x + 0.02, bow.y + 0.09)
  ink(ctx, 'detail')
  for (const s of spots) if (s.shown) drawBalloon(ctx, s.x, s.y, s.k, s.colour)
  // The bow.
  if (fine) {
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.ellipse(bow.x + side * 0.035, bow.y - 0.005, 0.035, 0.02, side * 0.4, 0, TAU)
      part(ctx, C.heart, 'detail')
    }
  }
  circlePath(ctx, bow.x, bow.y, 0.014)
  part(ctx, C.heart, 'detail')
  // The pop: a spiky burst in the balloon's colour with a white star in it (the renderer adds confetti for the 'pop' sound).
  if (popped >= 0 && play >= 0.07 && play < POP_GONE) {
    const b = BALLOONS[popped]!
    const u = (play - 0.07) / (POP_GONE - 0.07)
    const r = 0.17 * swell(u)
    if (r > 0.01) {
      ctx.beginPath()
      for (let i = 0; i < 16; i++) {
        const a = (i * TAU) / 16
        const rr = i % 2 === 0 ? r : r * 0.55
        ctx.lineTo(b.x + Math.cos(a) * rr, b.y + Math.sin(a) * rr)
      }
      ctx.closePath()
      part(ctx, b.colour, 'line')
      starPath(ctx, b.x, b.y, r * 0.4)
      part(ctx, C.white, 'detail')
    }
  }
  ctx.restore()
}

/** The bunting's string: its ends and how far it sags, and its flags. */
const BUNTING = { x: 0.43, y: -0.25, sag: 0.3, flags: 6, w: 0.17, h: 0.25 } as const

/** A string of bunting across the wall: rainbow flags with white dots, fluttering a little; a tap sets them all fluttering. */
const bunting: ItemDraw = (ctx, t, play) => {
  const fine = detail(0.6) !== 'S'
  const b = BUNTING
  const flutter = play >= 0 && play < 1.2 ? 0.25 * (1 - play / 1.2) : 0
  // The string is a quadratic from end to end with its control point `sag` below them.
  const at = (s: number) => {
    const x = -b.x + 2 * b.x * s
    const y = b.y + 2 * s * (1 - s) * b.sag
    const dy = 2 * (1 - 2 * s) * b.sag
    const a = Math.atan2(dy, 2 * b.x)
    return { x, y, a }
  }
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(-b.x, b.y)
  ctx.quadraticCurveTo(0, b.y + b.sag, b.x, b.y)
  tube(ctx, 0.012, PARTY.string)
  for (let i = 0; i < b.flags; i++) {
    const p = at((i + 0.5) / b.flags)
    const swing = 0.06 * Math.sin(TAU * (t / 1.9 + i * 0.23)) + flutter * Math.sin(play * 14 + i * 1.3)
    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.rotate(p.a + swing)
    ctx.beginPath()
    ctx.moveTo(-b.w / 2, 0)
    ctx.lineTo(b.w / 2, 0)
    ctx.lineTo(0, b.h)
    ctx.closePath()
    part(ctx, C.rainbow[i % C.rainbow.length]!, 'line')
    if (fine) {
      circlePath(ctx, 0, b.h * 0.33, 0.022)
      ctx.fillStyle = C.white
      ctx.fill()
    }
    ctx.restore()
  }
  // A push pin at each end.
  for (const x of [-b.x, b.x]) {
    circlePath(ctx, x, b.y, 0.028)
    part(ctx, PARTY.pin, 'detail')
  }
  ctx.restore()
}

/** The cake on its stand: the stand's plate top, the two tiers and the three candles on top. */
const CAKE = {
  plate: { x: -0.36, y: -0.3, w: 0.68, h: 0.04, d: 0.06 },
  tiers: [
    { x: -0.3, y: -0.6, w: 0.52, h: 0.27, faces: FACES.pinkTier, drip: C.white, drips: 7 },
    { x: -0.17, y: -0.86, w: 0.32, h: 0.22, faces: FACES.vanillaTier, drip: FACES.pinkTier.face, drips: 5 },
  ],
  candles: [
    { x: -0.07, colour: C.confetti[4] },
    { x: 0.03, colour: C.confetti[1] },
    { x: 0.13, colour: C.confetti[2] },
  ],
  candle: { base: -0.9, h: 0.12, w: 0.034 },
  d: 0.08,
} as const
/** The blow: puffs cross the candles until BLOWN, smoke rises until SMOKE_DONE, and each candle lights again from RELIGHT, one after another. */
const BLOWN = 0.35
const SMOKE_DONE = 0.95
const RELIGHT = 0.85

/** Icing over the top of a tier's front: a band along the top edge with round drips of different lengths. */
function drips(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, n: number, colour: string) {
  const dw = w / n
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + w, y)
  for (let i = n - 1; i >= 0; i--) {
    const len = 0.035 + (((i * 5) % 3) * 0.022)
    const cx = x + (i + 0.5) * dw
    ctx.lineTo(x + (i + 1) * dw, y + 0.03)
    ctx.lineTo(cx + dw * 0.32, y + len)
    ctx.arc(cx, y + len, dw * 0.32, 0, Math.PI)
    ctx.lineTo(x + i * dw, y + 0.03)
  }
  ctx.closePath()
  part(ctx, colour, 'detail')
}

/** A candle flame at the wick (x, y), `k` of its size, leaning `lean` radians: a yellow drop with a pale heart. */
function flame(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, lean: number) {
  if (k < 0.03) return
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(lean)
  ctx.scale(k, k)
  ctx.beginPath()
  ctx.moveTo(0, -0.1)
  ctx.quadraticCurveTo(0.04, -0.04, 0.025, -0.01)
  ctx.arc(0, -0.015, 0.025, 0.2, Math.PI - 0.2)
  ctx.quadraticCurveTo(-0.04, -0.04, 0, -0.1)
  ctx.closePath()
  part(ctx, PARTY.flame, 'detail')
  ctx.beginPath()
  ctx.ellipse(0, -0.025, 0.011, 0.022, 0, 0, TAU)
  ctx.fillStyle = PARTY.flameCore
  ctx.fill()
  ctx.restore()
}

/**
 * A two-tier birthday cake on a white stand, icing dripping over each tier, three striped
 * candles flickering. A tap blows them out (puffs of breath sweep across, the flames lean
 * and go out, smoke curls up), and then they light again one by one with a sparkle.
 */
const cake: ItemDraw = (ctx, t, play) => {
  const fine = detail(1.15) !== 'S'
  const p = play >= 0 && play < 1.6 ? play : -1
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  groundShadow(ctx, 0.5)
  // The stand: a foot, a stem and the plate.
  ctx.beginPath()
  ctx.moveTo(-0.15, 0)
  ctx.lineTo(-0.05, -0.06)
  ctx.lineTo(-0.035, -0.27)
  ctx.lineTo(0.035, -0.27)
  ctx.lineTo(0.05, -0.06)
  ctx.lineTo(0.15, 0)
  ctx.closePath()
  part(ctx, FACES.stand.face, 'line')
  const pl = CAKE.plate
  box(ctx, pl.x, pl.y, pl.w, pl.h, FACES.stand, pl.d, true, true, 'line')
  for (const [i, tier] of CAKE.tiers.entries()) {
    box(ctx, tier.x, tier.y, tier.w, tier.h, tier.faces, CAKE.d, true, true, 'line')
    drips(ctx, tier.x, tier.y, tier.w, tier.drips, tier.drip)
    if (fine && i === 0) {
      // Sprinkles on the bottom tier.
      for (let k = 0; k < 7; k++) {
        const sx = tier.x + 0.06 + k * 0.065
        const sy = tier.y + 0.15 + (k % 2) * 0.05
        ctx.beginPath()
        ctx.moveTo(sx - 0.012, sy - 0.008 * (k % 3 - 1))
        ctx.lineTo(sx + 0.012, sy + 0.008 * (k % 3 - 1))
        ctx.lineWidth = 0.014
        ctx.strokeStyle = C.confetti[k % 6]!
        ctx.stroke()
      }
    }
  }
  const cd = CAKE.candle
  const blown = p < 0 ? 0 : smooth(0.12, BLOWN, p)
  for (const [i, c] of CAKE.candles.entries()) {
    ctx.beginPath()
    ctx.rect(c.x - cd.w / 2, cd.base - cd.h, cd.w, cd.h)
    part(ctx, c.colour, 'detail')
    if (fine) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(c.x - cd.w / 2, cd.base - cd.h, cd.w, cd.h)
      ctx.clip()
      ctx.beginPath()
      for (let k = 0; k < 3; k++) {
        const y = cd.base - 0.02 - k * 0.04
        ctx.moveTo(c.x - cd.w, y)
        ctx.lineTo(c.x + cd.w, y - 0.03)
      }
      ctx.lineWidth = 0.01
      ctx.strokeStyle = C.white
      ctx.stroke()
      ctx.restore()
    }
    const wick = cd.base - cd.h
    ctx.beginPath()
    ctx.moveTo(c.x, wick)
    ctx.lineTo(c.x, wick - 0.02)
    ink(ctx, 'detail')
    // Lit, blown out, then lit again with a sparkle.
    const relight = p < 0 ? 1 : smooth(RELIGHT + i * 0.12, RELIGHT + 0.15 + i * 0.12, p)
    const k = p < 0 ? 1 : p < RELIGHT ? 1 - blown : relight
    const flicker = 1 + 0.07 * Math.sin(TAU * (t * 1.7 + i * 0.37))
    flame(ctx, c.x, wick - 0.015, k * flicker, p >= 0 && p < RELIGHT ? 0.7 * blown : 0.05 * Math.sin(TAU * (t * 0.9 + i * 0.3)))
    if (p >= 0) {
      // Smoke curling up from the wick after the flame goes out.
      const su = (p - BLOWN) / (SMOKE_DONE - BLOWN)
      for (let s = 0; s < 2; s++) {
        const v = clamp01(su - s * 0.25)
        const r = 0.03 * swell(v)
        if (r < 0.004) continue
        const sx = c.x + 0.025 * Math.sin(v * 6 + s * 2)
        const sy = wick - 0.05 - 0.12 * v
        blob(ctx, [sx, sy, r, sx - r * 0.7, sy + r * 0.5, r * 0.65, sx + r * 0.6, sy + r * 0.6, r * 0.55], PARTY.smoke, 'detail')
      }
      sparkle(ctx, c.x + 0.03, wick - 0.07, 0.1 * swell(clamp01((p - RELIGHT - i * 0.12) / 0.45)), C.sparkleWarm)
    }
  }
  // Puffs of breath sweeping in from the left across the candles.
  if (p >= 0 && p < BLOWN + 0.15)
    for (let i = 0; i < 3; i++) {
      const u = clamp01((p - i * 0.05) / (BLOWN + 0.05))
      const r = 0.045 * swell(u)
      if (r < 0.004) continue
      const x = mix(-0.44, 0.05, u)
      const y = -1.01 + 0.03 * i
      blob(ctx, [x, y, r, x - r * 0.8, y + r * 0.3, r * 0.7], PARTY.smoke, 'detail')
    }
  ctx.restore()
}

/** The party hat: its brim's half width and height on the head, and its tilt. */
const HAT = { y: -0.955, w: 0.085, h: 0.22, tilt: 0.25 } as const
/** The party blower blows every BLOW_EVERY seconds, unrolling for BLOW_FOR. */
const BLOW_EVERY = 3.4
const BLOW_FOR = 0.9

/** The party blower from the mouth: a paper tube rolled up in a curl (u 0) or blown out straight (u 1). */
function blower(ctx: CanvasRenderingContext2D, u: number) {
  const seg = 0.03
  const tip = MOUTH.x + 0.08
  let x = tip
  let y = MOUTH.y + 0.01
  let a = 0.15
  ctx.beginPath()
  ctx.moveTo(x, y)
  for (let i = 0; i < 9; i++) {
    a += (1 - u) * (0.22 + 0.07 * i)
    x += Math.cos(a) * seg
    y += Math.sin(a) * seg
    ctx.lineTo(x, y)
  }
  tube(ctx, 0.024, PARTY.blower)
  ctx.beginPath()
  ctx.moveTo(MOUTH.x - 0.005, MOUTH.y)
  ctx.lineTo(tip, MOUTH.y + 0.01)
  tube(ctx, 0.02, PARTY.blowerTip)
}

/** A friend in a spotty party hat with a party blower that unrolls every few seconds. A tap: they jump up cheering, blowing hard, and confetti flies. */
const partyKid: ItemDraw = (ctx, t, play) => {
  const look = FRIENDS[WHO.partyKid]!
  const k = held(play, 0.15, 0.9, 1.35)
  const cheering = play >= 0 && play < 1.35
  const rig = mixRig(posed('stand', t + 0.8), posed('cheer', cheering ? play : 0.9), k)
  const idleBlow = loop(t, BLOW_EVERY, 0.4) * BLOW_EVERY
  const blow = Math.max(smooth(0, 0.15, idleBlow) * (1 - smooth(BLOW_FOR - 0.25, BLOW_FOR, idleBlow)), cheering ? held(play, 0.25, 1.0, 1.3) : 0)
  const fine = detail(1.15) !== 'S'
  drawFriend(ctx, look, rig, 1, (layer) => {
    if (layer === 'behind') return
    inRig(ctx, rig, 'head', () => {
      ctx.save()
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.translate(HEAD.x - 0.005, HAT.y)
      ctx.rotate(HAT.tilt)
      ctx.beginPath()
      ctx.moveTo(-HAT.w, 0)
      ctx.lineTo(0, -HAT.h)
      ctx.lineTo(HAT.w, 0)
      ctx.quadraticCurveTo(0, 0.03, -HAT.w, 0)
      ctx.closePath()
      part(ctx, PARTY.hat, 'line')
      if (fine)
        for (const [dx, dy] of [
          [-0.03, -0.04],
          [0.035, -0.06],
          [-0.005, -0.13],
        ] as const) {
          circlePath(ctx, dx, dy, 0.016)
          ctx.fillStyle = PARTY.hatDot
          ctx.fill()
        }
      blob(ctx, [0, -HAT.h, 0.035, -0.02, -HAT.h + 0.015, 0.025, 0.02, -HAT.h + 0.015, 0.025], PARTY.pompom, 'line')
      ctx.restore()
      ctx.save()
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      blower(ctx, blow)
      ctx.restore()
    })
  })
  if (play >= 0) spray(ctx, play - 0.25, 0.08, -0.98, 12, 0, 1.2, 0.26, 0.5, 1.25, 0.06, 'confetti', C.confetti, 1)
}

/** The pile of gifts: the big box, the small one beside it, and the one on top whose lid pops off. */
const GIFTS = {
  big: { x: -0.44, y: -0.42, w: 0.46, h: 0.42, d: 0.08, faces: BOX.cobalt, ribbon: C.confetti[1] },
  small: { x: 0.1, y: -0.3, w: 0.3, h: 0.3, d: 0.07, faces: FACES.red, ribbon: C.white },
  top: { x: -0.32, y: -0.62, w: 0.26, h: 0.16, d: 0.06, faces: FACES.green, ribbon: C.heart, lid: 0.07 },
} as const

/** A ribbon round a box (x, y, w, h, depth d): down the front, back over the top, and along the side. */
function ribbon(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, d: number, colour: string) {
  const rw = Math.min(0.05, w * 0.18)
  const cx = x + w / 2
  ctx.beginPath()
  ctx.rect(cx - rw / 2, y, rw, h)
  ctx.moveTo(cx - rw / 2, y)
  ctx.lineTo(cx - rw / 2 + d, y - d)
  ctx.lineTo(cx + rw / 2 + d, y - d)
  ctx.lineTo(cx + rw / 2, y)
  ctx.closePath()
  ctx.moveTo(x + w, y + h / 2 - rw / 2)
  ctx.lineTo(x + w + d, y + h / 2 - rw / 2 - d)
  ctx.lineTo(x + w + d, y + h / 2 + rw / 2 - d)
  ctx.lineTo(x + w, y + h / 2 + rw / 2)
  ctx.closePath()
  part(ctx, colour, 'detail')
}
/** A bow sitting on a box's top face at (x, y): two loops and a knot. */
function bow(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, colour: string) {
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.ellipse(x + side * 0.045 * s, y - 0.03 * s, 0.05 * s, 0.03 * s, side * -0.5, 0, TAU)
    part(ctx, colour, 'line')
  }
  circlePath(ctx, x, y - 0.015 * s, 0.022 * s)
  part(ctx, colour, 'line')
}

/** A gift box with its ribbon and, when `withBow`, its bow on top. */
function gift(ctx: CanvasRenderingContext2D, g: { x: number; y: number; w: number; h: number; d: number; faces: Faces; ribbon: string }, withBow: boolean, fine: boolean) {
  box(ctx, g.x, g.y, g.w, g.h, g.faces, g.d, true, true, 'line')
  if (fine) ribbon(ctx, g.x, g.y, g.w, g.h, g.d, g.ribbon)
  if (withBow) bow(ctx, g.x + g.w / 2 + g.d / 2, g.y - g.d / 2, g.w > 0.35 ? 1.2 : 1, g.ribbon)
}

/**
 * A pile of three ribboned gifts. A tap pops the top one open: its lid flies up and a gold
 * star bounces out on a spring with a puff of confetti, then sinks back in and the lid drops
 * shut.
 */
const gifts: ItemDraw = (ctx, t, play) => {
  void t
  const fine = detail(1.15) !== 'S'
  const p = play >= 0 && play < 1.5 ? play : -1
  const open = p < 0 ? 0 : smooth(0, 0.14, p) * (1 - smooth(1.1, 1.35, p))
  // The spring: out with a boing that rings down, back in before the lid shuts.
  const spring = p < 0 ? 0 : clamp01(smooth(0.05, 0.22, p) * (1 + 0.25 * Math.sin((p - 0.22) * 18) * Math.exp(-4 * Math.max(0, p - 0.22))) * (1 - smooth(0.95, 1.2, p)))
  const g = GIFTS.top
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  groundShadow(ctx, 0.9)
  gift(ctx, GIFTS.big, false, fine)
  gift(ctx, GIFTS.small, true, fine)
  // The top gift's box, the spring and star inside, and its lid.
  const top = { ...g, y: g.y + g.lid, h: g.h - g.lid }
  gift(ctx, top, false, fine)
  const sx = g.x + g.w / 2 + g.d / 2
  const sy = top.y - g.d / 2
  if (spring > 0.02) {
    const len = 0.3 * spring
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    for (let i = 1; i <= 8; i++) ctx.lineTo(sx + (i % 2 ? 0.035 : -0.035), sy - (len * i) / 8)
    ctx.lineTo(sx, sy - len)
    tube(ctx, 0.012, PARTY.spring)
    starPath(ctx, sx, sy - len - 0.06, 0.08)
    part(ctx, PARTY.starGold, 'line')
  }
  ctx.save()
  ctx.translate(g.x + g.w, g.y + g.lid)
  ctx.rotate(-0.5 * open)
  ctx.translate(0, -0.32 * open)
  const lid = { ...g, x: -g.w - 0.015, y: -g.lid, w: g.w + 0.03, h: g.lid }
  gift(ctx, lid, true, fine)
  ctx.restore()
  if (p >= 0) spray(ctx, p - 0.1, sx, sy - 0.05, 9, 0, 0.9, 0.3, 0.4, 1.2, 0.06, 'confetti', C.confetti, 2)
  ctx.restore()
}

// ---------------------------------------------------------------------------------------
// Music

const musicFloor: FloorDraw = (ctx, w, t, variant) => {
  void t
  const c = MUSIC_FLOORS[variant]
  const key = 0.135
  const gap = 0.014
  ctx.save()
  ctx.fillStyle = c.gap
  ctx.fillRect(0, 0, w, FLOOR_BAND)
  ctx.fillStyle = c.key
  for (let i = 0; i * key < w; i++) ctx.fillRect(i * key + gap / 2, 0, key - gap, FLOOR_BAND - gap / 2)
  // The short keys sit between keys 0-1, 1-2, 3-4, 4-5 and 5-6 of every seven.
  ctx.fillStyle = c.sharp
  for (let i = 0; i * key < w; i++) if ([0, 1, 3, 4, 5].includes(i % 7)) ctx.fillRect((i + 1) * key - 0.04, 0, 0.08, FLOOR_BAND * 0.55)
  ctx.restore()
}

/** The note mobile: the rod under the ceiling, and each note lamp's hook on it and how far it hangs (its colours are LAMP_COLOURS). A lamp lights for LAMP_EVERY seconds in turn. */
const MOBILE = { rod: 0.1, half: 0.3 } as const
const LAMPS = [
  { x: -0.27, y: 0.3, ...LAMP_COLOURS[0] },
  { x: 0.0, y: 0.37, ...LAMP_COLOURS[1] },
  { x: 0.27, y: 0.28, ...LAMP_COLOURS[2] },
] as const
const LAMP = 0.21
const LAMP_EVERY = 0.7

/** A mobile of three note-shaped lamps on a rod, lighting one after another. A tap lights them all with sparkles (the renderer spins it). */
const noteLights: ItemDraw = (ctx, t, play) => {
  const fine = detail(0.6) !== 'S'
  const lit = step(t, LAMP_EVERY, LAMPS.length)
  const all = play >= 0 && play < 1.2
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(0, MOBILE.rod)
  ink(ctx, 'detail')
  for (const [i, l] of LAMPS.entries()) {
    const swing = 0.07 * Math.sin(TAU * (t / 2.1 + i * 0.3))
    const on = all || i === lit
    ctx.save()
    ctx.translate(l.x, MOBILE.rod)
    ctx.rotate(swing)
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(0, l.y - MOBILE.rod)
    ink(ctx, 'detail')
    if (on) {
      circlePath(ctx, -0.02, l.y - MOBILE.rod + LAMP * 0.62, LAMP * 0.55)
      ctx.fillStyle = C.light
      ctx.fill()
    }
    drawNote(ctx, 0.02, l.y - MOBILE.rod, LAMP, on ? l.on : l.off)
    if (all) sparkle(ctx, 0.1, l.y - MOBILE.rod + 0.02, 0.09 * swell(clamp01((play - i * 0.1) / 1.0)), C.sparkle)
    ctx.restore()
  }
  ctx.beginPath()
  ctx.moveTo(-MOBILE.half, MOBILE.rod)
  ctx.lineTo(MOBILE.half, MOBILE.rod)
  tube(ctx, 0.022, PARTY.wood)
  if (fine)
    for (const x of [-MOBILE.half, MOBILE.half]) {
      circlePath(ctx, x, MOBILE.rod, 0.02)
      part(ctx, PARTY.woodDark, 'detail')
    }
  ctx.restore()
}

/** The guitar hangs at this tilt; in its own frame (x along the neck) the body's bouts, the sound hole, the bridge, the neck and the head. */
const GUITAR = { tilt: -0.42, lower: [-0.22, 0, 0.15], upper: [-0.03, 0, 0.115], hole: [-0.09, 0, 0.045], bridge: -0.27, neck: [0.06, 0.37], headEnd: 0.46 } as const

/** An orange guitar on the wall. A tap twangs it: the strings blur back and forth and settle (the renderer shakes it). */
const guitar: ItemDraw = (ctx, t, play) => {
  void t
  const fine = detail(0.6) !== 'S'
  const g = GUITAR
  const twang = play >= 0 && play < 1.1 ? 0.016 * (1 - play / 1.1) : 0
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.translate(0.02, 0.0)
  ctx.rotate(g.tilt)
  // The neck and the head behind the body.
  ctx.beginPath()
  ctx.rect(g.neck[0], -0.026, g.neck[1] - g.neck[0], 0.052)
  part(ctx, PARTY.neck, 'line')
  ctx.beginPath()
  ctx.moveTo(g.neck[1], -0.03)
  ctx.lineTo(g.headEnd, -0.045)
  ctx.lineTo(g.headEnd, 0.045)
  ctx.lineTo(g.neck[1], 0.03)
  ctx.closePath()
  part(ctx, PARTY.head, 'line')
  if (fine)
    for (const px of [g.neck[1] + 0.03, g.neck[1] + 0.07])
      for (const side of [-1, 1]) {
        circlePath(ctx, px, side * 0.055, 0.014)
        part(ctx, PARTY.silver, 'detail')
      }
  blob(ctx, [...g.lower, ...g.upper, -0.12, 0, 0.1], PARTY.guitar, 'line')
  shine(ctx, g.lower[0], g.lower[1], g.lower[2])
  circlePath(ctx, g.hole[0], g.hole[1], g.hole[2] + 0.012)
  part(ctx, PARTY.skin, 'detail')
  circlePath(ctx, g.hole[0], g.hole[1], g.hole[2])
  ctx.fillStyle = PARTY.guitarHole
  ctx.fill()
  roundRectPath(ctx, g.bridge - 0.02, -0.05, 0.035, 0.1, 0.01)
  part(ctx, PARTY.head, 'detail')
  // The strings: straight at rest, a wobbling bow along their length while they ring.
  if (fine) {
    ctx.beginPath()
    for (const [i, sy] of [-0.016, 0, 0.016].entries()) {
      const amp = twang * Math.sin(play * 40 + i * 2)
      ctx.moveTo(g.bridge, sy * 1.6)
      ctx.quadraticCurveTo((g.bridge + g.neck[1]) / 2, sy * 1.3 + amp * 2, g.neck[1], sy)
    }
    ctx.lineWidth = lw('detail')
    ctx.strokeStyle = PARTY.skin
    ctx.stroke()
  }
  ctx.restore()
}

/** The drum kit: the bass drum's centre and radius, the tom on it, the snare on its stand, the cymbal on its stand, and the sticks' length. */
const KIT = {
  bass: { x: 0.0, y: -0.31, r: 0.27 },
  tom: { x: -0.05, y: -0.71, w: 0.22, h: 0.12 },
  snare: { x: 0.33, y: -0.6, w: 0.24, h: 0.1 },
  cymbal: { x: -0.33, y: -0.9, stand: -0.37, r: 0.15 },
  stick: 0.3,
} as const
/** The roll: the sticks rise until ROLL_FROM, hit HITS times in turn until ROLL_TO, the cymbal crashes at CRASH and everything rests by 1.5 s. */
const ROLL_FROM = 0.15
const ROLL_TO = 1.05
const HITS = 6
const CRASH = 1.05

/** A drum seen from the side: the shell (x, y its top centre, w wide, h tall) with its skin as a lit oval on top, pressed down by `hit`. */
function drum(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, hit: number) {
  const sy = 1 - 0.25 * hit
  ctx.beginPath()
  ctx.rect(x - w / 2, y, w, h)
  part(ctx, PARTY.drum, 'line')
  ctx.beginPath()
  ctx.ellipse(x, y + 0.005 * hit, w / 2, 0.035 * sy, 0, 0, TAU)
  part(ctx, PARTY.skin, 'line')
}

/**
 * A red drum kit: the bass drum with a star on its skin, a tom, a snare on its stand, a gold
 * cymbal. Two sticks rest on the snare; a tap makes the kit bounce and the sticks jump up and
 * do a roll by themselves on the snare and the tom, ending on a cymbal crash.
 */
const drumKit: ItemDraw = (ctx, t, play) => {
  void t
  const fine = detail(1.15) !== 'S'
  const p = play >= 0 && play < 1.6 ? play : -1
  const q = p < 0 ? -1 : (p - ROLL_FROM) / (ROLL_TO - ROLL_FROM)
  const rolling = q >= 0 && q < 1
  // Which stick is down: each beat of the roll one stick hits, the other is up.
  const beat = rolling ? q * HITS : 0
  const down = (side: number) => (rolling && Math.floor(beat) % 2 === side ? Math.sin(Math.PI * (beat % 1)) : 0)
  const crash = p >= CRASH ? Math.exp(-4 * (p - CRASH)) * Math.sin((p - CRASH) * 22) * (1 - smooth(CRASH + 0.2, 1.5, p)) : 0
  const bounce = p < 0 ? 0 : 0.035 * arch(clamp01(p / 0.3))
  const k = KIT
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  groundShadow(ctx, 0.85)
  // The cymbal and its stand at the back left.
  ctx.beginPath()
  ctx.moveTo(k.cymbal.stand, -0.005)
  ctx.lineTo(k.cymbal.stand, k.cymbal.y)
  ctx.moveTo(k.cymbal.stand - 0.08, 0)
  ctx.lineTo(k.cymbal.stand, -0.12)
  ctx.lineTo(k.cymbal.stand + 0.08, 0)
  tube(ctx, 0.016, PARTY.silverMid)
  ctx.save()
  ctx.translate(k.cymbal.x, k.cymbal.y)
  ctx.rotate(-0.12 + 0.3 * crash)
  ctx.beginPath()
  ctx.ellipse(0, 0, k.cymbal.r, 0.032, 0, 0, TAU)
  part(ctx, PARTY.cymbal, 'line')
  ctx.beginPath()
  ctx.ellipse(0, -0.02, 0.035, 0.022, 0, Math.PI, 0)
  part(ctx, PARTY.cymbalDark, 'detail')
  ctx.restore()
  // The snare's stand.
  ctx.beginPath()
  ctx.moveTo(k.snare.x, k.snare.y + k.snare.h)
  ctx.lineTo(k.snare.x, -0.12)
  ctx.moveTo(k.snare.x - 0.1, 0)
  ctx.lineTo(k.snare.x, -0.12)
  ctx.lineTo(k.snare.x + 0.1, 0)
  tube(ctx, 0.016, PARTY.silverMid)
  ctx.save()
  ctx.translate(0, -bounce)
  // The bass drum's spurs, its shell and skin, and a star on it.
  ctx.beginPath()
  ctx.moveTo(k.bass.x - 0.17, k.bass.y + 0.17)
  ctx.lineTo(k.bass.x - 0.26, bounce)
  ctx.moveTo(k.bass.x + 0.17, k.bass.y + 0.17)
  ctx.lineTo(k.bass.x + 0.26, bounce)
  tube(ctx, 0.016, PARTY.silverMid)
  // The tom's post.
  ctx.beginPath()
  ctx.moveTo(k.tom.x + 0.02, k.bass.y - k.bass.r + 0.02)
  ctx.lineTo(k.tom.x + 0.02, k.tom.y + k.tom.h)
  tube(ctx, 0.016, PARTY.silverMid)
  circlePath(ctx, k.bass.x, k.bass.y, k.bass.r)
  part(ctx, PARTY.drum, 'line')
  circlePath(ctx, k.bass.x, k.bass.y, k.bass.r * 0.8)
  part(ctx, PARTY.skin, 'line')
  starPath(ctx, k.bass.x, k.bass.y + 0.01, k.bass.r * 0.42)
  part(ctx, PARTY.starGold, 'line')
  if (fine)
    for (let i = 0; i < 6; i++) {
      const a = (i * TAU) / 6 + 0.3
      circlePath(ctx, k.bass.x + Math.cos(a) * k.bass.r * 0.9, k.bass.y + Math.sin(a) * k.bass.r * 0.9, 0.012)
      part(ctx, PARTY.silver, 'detail')
    }
  drum(ctx, k.tom.x, k.tom.y, k.tom.w, k.tom.h, down(1))
  ctx.restore()
  drum(ctx, k.snare.x, k.snare.y, k.snare.w, k.snare.h, down(0))
  // The sticks: crossed on the snare at rest; on a tap they float up and take turns, tips tapping the snare and the tom.
  const air = p < 0 ? 0 : smooth(0, ROLL_FROM, p) * (1 - smooth(ROLL_TO + 0.05, 1.45, p))
  const sticks: readonly (readonly [number, number, number, number, number])[] = [
    // Where it rests (its tip and angle) and the skin it plays.
    [k.snare.x - 0.13, k.snare.y - 0.04, -0.12, k.snare.x - 0.07, k.snare.y],
    [k.snare.x - 0.11, k.snare.y - 0.09, 0.22, k.tom.x + 0.03, k.tom.y - bounce],
  ]
  sticks.forEach(([rx, ry, ra, hx, hy], side) => {
    const lift = 1 - down(side)
    const tx = mix(rx, hx, air)
    const ty = mix(ry, hy - 0.012 - 0.13 * lift, air)
    const a = mix(ra, -0.8 - 0.3 * lift, air)
    ctx.beginPath()
    ctx.moveTo(tx, ty)
    ctx.lineTo(tx + Math.cos(a) * KIT.stick, ty + Math.sin(a) * KIT.stick)
    tube(ctx, 0.02, PARTY.wood)
    circlePath(ctx, tx, ty, 0.016)
    part(ctx, PARTY.wood, 'detail')
    // A hit: three little strokes spring off the skin.
    const hit = air * smooth(0.55, 0.95, down(side))
    if (hit > 0.05) {
      ctx.beginPath()
      for (const da of [-0.9, 0, 0.9]) {
        const ca = -Math.PI / 2 + da
        ctx.moveTo(hx + Math.cos(ca) * 0.05, hy + Math.sin(ca) * 0.035)
        ctx.lineTo(hx + Math.cos(ca) * (0.05 + 0.05 * hit), hy + Math.sin(ca) * (0.035 + 0.05 * hit))
      }
      ink(ctx, 'line')
    }
  })
  ctx.restore()
}

/**
 * The singer's microphone on its stand in front of them, in the figure's metres: the pole's
 * foot and top, and the mic's head by the mouth. The mouth opens and shuts every SING
 * seconds; the near hand holds the pole just under the mic (the arm's angles reach it).
 */
const MIC = { x: 0.27, top: -0.6, headX: 0.19, headY: -0.695, r: 0.048, hold: { shoulder: 0.936, elbow: 1.142 } } as const
const SING = 0.45
/** The singer's big finish on a tap: leaning back, the free arm flung up, mouth wide. */
const FINISH: Rig = {
  ...posed('stand', 0),
  lift: -0.02,
  lean: -0.12,
  nod: -0.2,
  thigh: [-0.2, 0.25],
  knee: [0.05, 0.1],
  shoulder: [-2.4, MIC.hold.shoulder],
  elbow: [0.3, MIC.hold.elbow],
  tool: null,
  eyes: 'happy',
  mouth: true,
}

/** A friend in sunglasses singing into a microphone on a stand, the free arm swinging and little notes floating up. A tap: a big finish, leaning back with an arm flung up. */
const singer: ItemDraw = (ctx, t, play) => {
  const look = FRIENDS[WHO.singer]!
  const fine = detail(1.15) !== 'S'
  const stand = posed('stand', t + 1.3)
  const sway = Math.sin(TAU * (t / 1.8))
  const singing: Rig = {
    ...stand,
    lean: 0.03 * sway,
    nod: -0.06 + 0.03 * sway,
    shoulder: [-0.35 + 0.3 * sway, MIC.hold.shoulder],
    elbow: [0.5, MIC.hold.elbow],
    mouth: loop(t, SING * 2, 0) < 0.5,
  }
  const k = held(play, 0.25, 1.0, 1.4)
  const rig = mixRig(singing, FINISH, k)
  drawFriend(ctx, look, rig, 1, (layer) => {
    if (layer === 'behind') return
    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    // The stand: three feet, the pole, the mic leaning in to the mouth.
    ctx.beginPath()
    ctx.moveTo(MIC.x - 0.1, 0)
    ctx.lineTo(MIC.x, -0.08)
    ctx.lineTo(MIC.x + 0.1, 0)
    ctx.moveTo(MIC.x, -0.08)
    ctx.lineTo(MIC.x, MIC.top)
    tube(ctx, 0.018, PARTY.silverMid)
    const a = Math.atan2(MIC.headY - MIC.top, MIC.headX - MIC.x)
    ctx.beginPath()
    ctx.moveTo(MIC.x, MIC.top)
    ctx.lineTo(MIC.headX - Math.cos(a) * MIC.r, MIC.headY - Math.sin(a) * MIC.r)
    tube(ctx, 0.034, PARTY.micGrip)
    if (fine) {
      ctx.beginPath()
      ctx.moveTo(MIC.headX - Math.cos(a) * (MIC.r + 0.012), MIC.headY - Math.sin(a) * (MIC.r + 0.012))
      ctx.lineTo(MIC.headX - Math.cos(a) * MIC.r, MIC.headY - Math.sin(a) * MIC.r)
      tube(ctx, 0.04, PARTY.micRing)
    }
    circlePath(ctx, MIC.headX, MIC.headY, MIC.r)
    part(ctx, PARTY.mic, 'line')
    shine(ctx, MIC.headX, MIC.headY, MIC.r)
    ctx.restore()
    // The near hand round the pole.
    inRig(ctx, rig, 'upper', () => {
      const h = handAt(rig, 1)
      mitten(ctx, look, h.x, h.y, 1)
    })
  })
  // A little note floats up now and then (a tap's notes are the renderer's, for the 'note' sound).
  const u = loop(t, 1.6, 0.2)
  drawNote(ctx, 0.24 + 0.05 * u, -0.86 - 0.2 * u, 0.13 * swell(u), C.confetti[5])
}

/** The toy piano: its body, the keyboard sticking out of its front, the music on its stand, and the metronome on top swinging once every TICK seconds. */
const PIANO = { x: -0.42, y: -0.9, w: 0.7, h: 0.82, d: 0.12, keysY: -0.5, keysH: 0.07, keysD: 0.07, keys: 8 } as const
const TICK = 1.2
/** The tune a tap plays: the keys that light in turn, one every NOTE_FOR seconds (under three changes a second). */
const TUNE = [1, 3, 5, 7] as const
const NOTE_FOR = 0.34

/** A red toy piano with a metronome ticking on top. A tap plays a little tune up the keyboard: each key lights as it plays. */
const piano: ItemDraw = (ctx, t, play) => {
  const fine = detail(1.15) !== 'S'
  const pn = PIANO
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  groundShadow(ctx, 0.85)
  // Two feet, the body.
  for (const fx of [pn.x + 0.05, pn.x + pn.w - 0.14]) box(ctx, fx, -0.08, 0.09, 0.08, FACES.piano, 0.04, false, true, 'line')
  box(ctx, pn.x, pn.y, pn.w, pn.h, FACES.piano, pn.d, true, true, 'line')
  // The music on its stand.
  ctx.beginPath()
  ctx.rect(pn.x + 0.2, pn.y + 0.08, 0.28, 0.2)
  part(ctx, PARTY.sheet, 'line')
  if (fine) {
    ctx.beginPath()
    for (let i = 0; i < 3; i++) {
      ctx.moveTo(pn.x + 0.23, pn.y + 0.13 + i * 0.05)
      ctx.lineTo(pn.x + 0.45, pn.y + 0.13 + i * 0.05)
    }
    ctx.lineWidth = lw('detail') * 0.8
    ctx.strokeStyle = PARTY.silverMid
    ctx.stroke()
    for (const [i, nx] of [0.26, 0.34, 0.42].entries()) {
      ctx.beginPath()
      ctx.ellipse(pn.x + nx, pn.y + 0.14 + (i % 2) * 0.05, 0.016, 0.011, -0.4, 0, TAU)
      ctx.fillStyle = INK
      ctx.fill()
    }
  }
  // The keyboard: a white box sticking out of the front, its keys' tops on its top face.
  const kx = pn.x - 0.02
  const kw = pn.w + 0.02
  box(ctx, kx, pn.keysY, kw, pn.keysH, FACES.keys, pn.keysD, true, true, 'line')
  const keyW = kw / pn.keys
  for (let i = 0; i < pn.keys; i++) {
    const n = TUNE.indexOf(i as (typeof TUNE)[number])
    const glow = n < 0 || play < 0 ? 0 : swell(clamp01((play - n * NOTE_FOR) / (NOTE_FOR * 1.4)))
    if (glow > 0.15) {
      // The lit key's top and front.
      const x = kx + i * keyW
      ctx.beginPath()
      ctx.moveTo(x, pn.keysY)
      ctx.lineTo(x + pn.keysD, pn.keysY - pn.keysD)
      ctx.lineTo(x + keyW + pn.keysD, pn.keysY - pn.keysD)
      ctx.lineTo(x + keyW, pn.keysY)
      ctx.closePath()
      ctx.rect(x, pn.keysY, keyW, pn.keysH)
      ctx.fillStyle = PARTY.keyLit
      ctx.fill()
    }
  }
  ctx.beginPath()
  for (let i = 1; i < pn.keys; i++) {
    const x = kx + i * keyW
    ctx.moveTo(x, pn.keysY + pn.keysH)
    ctx.lineTo(x, pn.keysY)
    ctx.lineTo(x + pn.keysD, pn.keysY - pn.keysD)
  }
  ink(ctx, 'detail')
  for (let i = 0; i < pn.keys - 1; i++) {
    if (![0, 1, 3, 4, 5].includes(i % 7)) continue
    const x = kx + (i + 1) * keyW
    ctx.beginPath()
    ctx.moveTo(x - 0.018 + pn.keysD * 0.35, pn.keysY - pn.keysD * 0.35)
    ctx.lineTo(x - 0.018 + pn.keysD, pn.keysY - pn.keysD)
    ctx.lineTo(x + 0.018 + pn.keysD, pn.keysY - pn.keysD)
    ctx.lineTo(x + 0.018 + pn.keysD * 0.35, pn.keysY - pn.keysD * 0.35)
    ctx.closePath()
    part(ctx, PARTY.sharp, 'detail')
  }
  // The metronome on top: a wooden pyramid with its arm swinging.
  const mx = pn.x + pn.w - 0.2 + pn.d / 2
  const my = pn.y - pn.d / 2
  ctx.beginPath()
  ctx.moveTo(mx - 0.07, my)
  ctx.lineTo(mx - 0.03, my - 0.2)
  ctx.lineTo(mx + 0.03, my - 0.2)
  ctx.lineTo(mx + 0.07, my)
  ctx.closePath()
  part(ctx, PARTY.wood, 'line')
  const swing = 0.4 * Math.sin((TAU * t) / TICK)
  ctx.save()
  ctx.translate(mx, my - 0.03)
  ctx.rotate(swing)
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(0, -0.16)
  ink(ctx, 'line')
  ctx.beginPath()
  ctx.rect(-0.018, -0.12, 0.036, 0.025)
  part(ctx, PARTY.silver, 'detail')
  ctx.restore()
  ctx.restore()
}

// ---------------------------------------------------------------------------------------
// Crafts

/** A paint splat about 0.35 m across: a round blob with lobes round it and two drops flung off. */
function splatMotif(ctx: CanvasRenderingContext2D, i: number) {
  ctx.scale(1.15, 1.15)
  ctx.beginPath()
  ctx.arc(0, 0, 0.1, 0, TAU)
  for (let k = 0; k < 7; k++) {
    const a = (k * TAU) / 7 + i
    const d = 0.1 + 0.015 * (k % 3)
    const r = 0.035 + 0.012 * ((k + i) % 3)
    ctx.moveTo(Math.cos(a) * d + r, Math.sin(a) * d)
    ctx.arc(Math.cos(a) * d, Math.sin(a) * d, r, 0, TAU)
  }
  for (const [d, r, a] of [
    [0.2, 0.025, i * 1.7],
    [0.18, 0.017, i * 1.7 + 2.4],
  ] as const) {
    ctx.moveTo(Math.cos(a) * d + r, Math.sin(a) * d)
    ctx.arc(Math.cos(a) * d, Math.sin(a) * d, r, 0, TAU)
  }
  ctx.fill()
}

const craftsFloor: FloorDraw = (ctx, w, t, variant) => {
  void t
  const c = CRAFTS_FLOORS[variant]
  const band = FLOOR_BAND
  ctx.save()
  ctx.fillStyle = c.board
  ctx.fillRect(0, 0, w, band)
  // Two rows of boards, their ends staggered.
  ctx.fillStyle = c.seam
  ctx.fillRect(0, band / 2 - 0.008, w, 0.016)
  for (let x = 0.55; x < w; x += 1.1) {
    ctx.fillRect(x, 0, 0.016, band / 2)
    ctx.fillRect(x + 0.55, band / 2, 0.016, band / 2)
  }
  ctx.fillRect(0, band - 0.03, w, 0.03)
  // Paint dropped here and there.
  for (let i = 0; 0.2 + i * 0.47 < w; i++) {
    ctx.beginPath()
    ctx.ellipse(0.2 + i * 0.47 + 0.1 * Math.sin(i * 2.3), 0.05 + 0.08 * ((i * 3) % 2), 0.035 + 0.012 * (i % 2), 0.02, 0, 0, TAU)
    ctx.fillStyle = DROPS[i % DROPS.length]!
    ctx.fill()
  }
  ctx.restore()
}

/** The paper chain: its ends under the ceiling, how far it sags, its links, and the paper star hanging from its middle. */
const CHAIN = { x: 0.42, y: 0.04, sag: 0.3, links: 11, star: 0.11 } as const

/** A paper chain looped across the ceiling in rainbow links, a paper star turning slowly below it. A tap bounces the chain like a spring and twirls the star. */
const paperChain: ItemDraw = (ctx, t, play) => {
  const fine = detail(0.6) !== 'S'
  const ch = CHAIN
  const boing = play >= 0 && play < 1.5 ? Math.sin(play * 11) * Math.exp(-3 * play) : 0
  const sag = ch.sag + 0.012 * Math.sin((TAU * t) / 2.6) + 0.07 * boing
  const at = (s: number) => {
    const x = -ch.x + 2 * ch.x * s
    const y = ch.y + 2 * s * (1 - s) * sag
    return { x, y, a: Math.atan2(2 * (1 - 2 * s) * sag, 2 * ch.x) }
  }
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  // The star on its thread below the chain's middle, turning (a full twirl on a tap).
  const mid = at(0.5)
  const sy = mid.y + 0.13
  ctx.beginPath()
  ctx.moveTo(0, mid.y)
  ctx.lineTo(0, sy - ch.star)
  ink(ctx, 'detail')
  const twirl = play >= 0 && play < 1.5 ? TAU * smooth(0, 1.2, play) : 0
  const turn = Math.cos((TAU * t) / 3 + twirl)
  ctx.save()
  ctx.translate(0, sy)
  ctx.scale(turn < 0 ? Math.min(-EDGE_ON, turn) : Math.max(EDGE_ON, turn), 1)
  starPath(ctx, 0, 0, ch.star)
  // Gold on the front, pink on the back.
  part(ctx, turn < 0 ? C.confetti[5] : PARTY.starGold, 'line')
  ctx.restore()
  // The links, one face-on and the next edge-on, each along the curve.
  for (let i = 0; i < ch.links; i++) {
    const p = at((i + 0.5) / ch.links)
    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.rotate(p.a)
    ctx.beginPath()
    if (i % 2 === 0) ctx.ellipse(0, 0, 0.05, 0.036, 0, 0, TAU)
    else ctx.ellipse(0, 0, 0.05, 0.011, 0, 0, TAU)
    tube(ctx, fine ? 0.02 : 0.026, C.rainbow[i % C.rainbow.length]!)
    ctx.restore()
  }
  // The tape holding each end to the ceiling.
  for (const x of [-ch.x, ch.x]) {
    ctx.beginPath()
    ctx.rect(x - 0.035, 0, 0.07, 0.035)
    part(ctx, PARTY.paper, 'detail')
  }
  ctx.restore()
}

/** The painting's frame: x, y, w, h, the frame's width and its depth. */
const FRAME = { x: -0.4, y: -0.26, w: 0.76, h: 0.5, rim: 0.06, d: 0.04 } as const

/** The painting's flower: five round petals `r` from its middle at (x, y), turned by `spin`. */
function flower(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, spin: number) {
  ctx.beginPath()
  for (let i = 0; i < 5; i++) {
    const a = spin + (i * TAU) / 5
    ctx.moveTo(x + Math.cos(a) * r + r * 0.55, y + Math.sin(a) * r)
    ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.55, 0, TAU)
  }
  ctx.fillStyle = PICTURE.petal
  ctx.fill()
  circlePath(ctx, x, y, r * 0.6)
  ctx.fillStyle = PICTURE.middle
  ctx.fill()
}

/** A framed painting of a sunny hill with a big flower on it. A tap twirls the painted flower and makes the frame's corner twinkle (the renderer grows it). */
const painting: ItemDraw = (ctx, t, play) => {
  void t
  const fine = detail(0.6) !== 'S'
  const f = FRAME
  const spin = play >= 0 && play < 1.2 ? TAU * smooth(0, 1.0, play) : 0
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  // The wire and the nail.
  if (fine) {
    ctx.beginPath()
    ctx.moveTo(f.x + 0.12, f.y + 0.02)
    ctx.lineTo(-0.02, f.y - 0.03)
    ctx.lineTo(f.x + f.w - 0.12, f.y + 0.02)
    ink(ctx, 'detail')
  }
  box(ctx, f.x, f.y, f.w, f.h, FACES.frame, f.d, true, true, 'line')
  const ix = f.x + f.rim
  const iy = f.y + f.rim
  const iw = f.w - 2 * f.rim
  const ih = f.h - 2 * f.rim
  ctx.save()
  ctx.beginPath()
  ctx.rect(ix, iy, iw, ih)
  ctx.fillStyle = PICTURE.sky
  ctx.fill()
  ctx.clip()
  circlePath(ctx, ix + iw - 0.1, iy + 0.09, 0.065)
  ctx.fillStyle = PICTURE.sun
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(ix, iy + ih * 0.66)
  ctx.quadraticCurveTo(ix + iw * 0.45, iy + ih * 0.38, ix + iw, iy + ih * 0.72)
  ctx.lineTo(ix + iw, iy + ih)
  ctx.lineTo(ix, iy + ih)
  ctx.closePath()
  ctx.fillStyle = PICTURE.hill
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(ix + iw * 0.4, iy + ih)
  ctx.lineTo(ix + iw * 0.4, iy + ih * 0.42)
  ctx.lineWidth = 0.022
  ctx.strokeStyle = PICTURE.stem
  ctx.stroke()
  flower(ctx, ix + iw * 0.4, iy + ih * 0.38, 0.055, spin + 0.3)
  ctx.restore()
  ctx.beginPath()
  ctx.rect(ix, iy, iw, ih)
  ink(ctx, 'detail')
  sparkle(ctx, f.x + f.w - 0.02, f.y + 0.02, 0.14 * swell(play < 0 ? 0 : play / 1.0), C.sparkleWarm)
  ctx.restore()
}

/** The easel: its apex, the canvas on it (top-left, size), the ledge under the canvas, and where the brush rests on the ledge. */
const EASEL = { top: -1.1, canvas: { x: -0.27, y: -1.0, w: 0.54, h: 0.5 }, ledge: -0.47, brush: { x: -0.16, y: -0.5, a: -0.08 } } as const
/** The painting: the brush lifts off until STROKES_FROM, paints three strokes of STROKE_FOR each, and is back on the ledge by 1.5 s. */
const STROKES_FROM = 0.15
const STROKE_FOR = 0.35

/** One brush stroke of a picture: its colour, the shape it paints (a path about the canvas's middle), the box the brush sweeps across left to right while it paints, and, when not 0, the radius of the rainbow arc it sweeps along instead. */
interface Stroke {
  colour: string
  shape: (ctx: CanvasRenderingContext2D) => void
  box: readonly [number, number, number, number]
  arc: number
}
const rectShape = (x: number, y: number, w: number, h: number) => (ctx: CanvasRenderingContext2D) => ctx.rect(x, y, w, h)
const band = (r: number) => (ctx: CanvasRenderingContext2D) => {
  ctx.arc(0, 0.17, r, Math.PI, 0)
  ctx.arc(0, 0.17, r - 0.045, 0, Math.PI, true)
  ctx.closePath()
}
/** The pictures the easel paints, three strokes each: a sun, a house, a cat and a rainbow, in canvas-middle metres. */
const PICTURES: readonly (readonly Stroke[])[] = [
  [
    { colour: PAINT.yellow, shape: (ctx) => ctx.arc(0.0, -0.04, 0.09, 0, TAU), box: [-0.09, -0.13, 0.09, 0.05], arc: 0 },
    {
      colour: PAINT.orange,
      shape: (ctx) => {
        for (let i = 0; i < 8; i++) {
          const a = (i * TAU) / 8
          const c = Math.cos(a)
          const s = Math.sin(a)
          ctx.moveTo(c * 0.12 - s * 0.012, -0.04 + s * 0.12 + c * 0.012)
          ctx.lineTo(c * 0.17 - s * 0.012, -0.04 + s * 0.17 + c * 0.012)
          ctx.lineTo(c * 0.17 + s * 0.012, -0.04 + s * 0.17 - c * 0.012)
          ctx.lineTo(c * 0.12 + s * 0.012, -0.04 + s * 0.12 - c * 0.012)
          ctx.closePath()
        }
      },
      box: [-0.17, -0.21, 0.17, 0.13],
      arc: 0,
    },
    { colour: PAINT.green, shape: rectShape(-0.25, 0.15, 0.5, 0.1), box: [-0.24, 0.15, 0.24, 0.23], arc: 0 },
  ],
  [
    { colour: PAINT.red, shape: rectShape(-0.12, -0.02, 0.24, 0.21), box: [-0.12, -0.02, 0.12, 0.19], arc: 0 },
    {
      colour: PAINT.blue,
      shape: (ctx) => {
        ctx.moveTo(-0.16, -0.02)
        ctx.lineTo(0, -0.17)
        ctx.lineTo(0.16, -0.02)
        ctx.closePath()
      },
      box: [-0.15, -0.15, 0.15, -0.03],
      arc: 0,
    },
    {
      colour: PAINT.yellow,
      shape: (ctx) => {
        ctx.rect(-0.08, 0.07, 0.065, 0.12)
        ctx.rect(0.03, 0.03, 0.06, 0.06)
      },
      box: [-0.08, 0.03, 0.09, 0.19],
      arc: 0,
    },
  ],
  [
    {
      colour: PAINT.ginger,
      shape: (ctx) => {
        ctx.arc(0, 0.03, 0.12, 0, TAU)
        ctx.moveTo(-0.11, -0.02)
        ctx.lineTo(-0.09, -0.16)
        ctx.lineTo(-0.02, -0.08)
        ctx.closePath()
        ctx.moveTo(0.11, -0.02)
        ctx.lineTo(0.09, -0.16)
        ctx.lineTo(0.02, -0.08)
        ctx.closePath()
      },
      box: [-0.12, -0.14, 0.12, 0.15],
      arc: 0,
    },
    {
      colour: PARTY.paintBrown,
      shape: (ctx) => {
        for (const x of [-0.045, 0.045]) {
          ctx.moveTo(x + 0.017, 0.0)
          ctx.arc(x, 0.0, 0.017, 0, TAU)
        }
        ctx.moveTo(-0.02, 0.05)
        ctx.lineTo(0.02, 0.05)
        ctx.lineTo(0, 0.075)
        ctx.closePath()
        for (const side of [-1, 1])
          for (const dy of [0.06, 0.09]) {
            ctx.moveTo(side * 0.05, dy)
            ctx.lineTo(side * 0.17, dy - 0.02)
            ctx.lineTo(side * 0.17, dy - 0.008)
            ctx.lineTo(side * 0.05, dy + 0.01)
            ctx.closePath()
          }
      },
      box: [-0.16, -0.02, 0.16, 0.1],
      arc: 0,
    },
    { colour: PAINT.pink, shape: (ctx) => heartPath(ctx, 0.17, -0.14, 0.09), box: [0.13, -0.18, 0.21, -0.1], arc: 0 },
  ],
  [
    { colour: PAINT.red, shape: band(0.21), box: [-0.19, -0.04, 0.19, 0.15], arc: 0.19 },
    { colour: PAINT.yellow, shape: band(0.165), box: [-0.14, 0.0, 0.14, 0.15], arc: 0.143 },
    { colour: PAINT.blue, shape: band(0.12), box: [-0.1, 0.05, 0.1, 0.15], arc: 0.098 },
  ],
]

/**
 * A wooden easel with a sun painted on its canvas and a brush on its ledge. A tap wipes the
 * canvas and the brush lifts off and paints a new picture in three strokes (a house, a cat, a
 * rainbow, in turn tap after tap), then goes back to the ledge.
 */
const easel: ItemDraw = (ctx, t, play) => {
  const fine = detail(1.15) !== 'S'
  const e = EASEL
  const cv = e.canvas
  const cx = cv.x + cv.w / 2
  const cy = cv.y + cv.h / 2
  const painting = play >= 0
  // The sun until the first tap, then the other pictures in turn, so every tap paints something new.
  const strokes = PICTURES[painting ? 1 + tapSlot(t, play, PICTURES.length - 1) : 0]!
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  groundShadow(ctx, 0.75)
  // The back leg, then the two front legs from the apex.
  ctx.beginPath()
  ctx.moveTo(0.02, e.top + 0.06)
  ctx.lineTo(0.14, -0.01)
  tube(ctx, 0.035, FACES.frame.side)
  ctx.beginPath()
  ctx.moveTo(-0.03, e.top)
  ctx.lineTo(-0.33, 0)
  ctx.moveTo(0.03, e.top)
  ctx.lineTo(0.33, 0)
  tube(ctx, 0.04, FACES.frame.face)
  // The canvas, and the picture on it.
  ctx.beginPath()
  ctx.rect(cv.x, cv.y, cv.w, cv.h)
  part(ctx, PARTY.canvas, 'line')
  ctx.save()
  ctx.beginPath()
  ctx.rect(cv.x, cv.y, cv.w, cv.h)
  ctx.clip()
  ctx.translate(cx, cy)
  let tip: readonly [number, number] = [e.brush.x - cx, e.brush.y - cy]
  let tipColour = PAINT.blue as string
  strokes.forEach((s, i) => {
    const u = painting ? clamp01((play - STROKES_FROM - i * STROKE_FOR) / STROKE_FOR) : 1
    if (u <= 0) return
    const [x0, y0, x1, y1] = s.box
    ctx.save()
    if (u < 1) {
      ctx.beginPath()
      if (s.arc > 0) {
        // A band of the rainbow sweeps from left to right along its arc.
        ctx.moveTo(0, 0.17)
        ctx.arc(0, 0.17, 0.3, Math.PI, Math.PI + Math.PI * u)
        ctx.closePath()
        tip = [-Math.cos(Math.PI * u) * s.arc, 0.17 - Math.sin(Math.PI * u) * s.arc]
      } else {
        ctx.rect(x0 - 0.02, y0 - 0.06, (x1 - x0 + 0.04) * u, y1 - y0 + 0.12)
        tip = [x0 + (x1 - x0) * u, mix(y0, y1, 0.5 + 0.5 * Math.sin(u * TAU * 2.5))]
      }
      ctx.clip()
      tipColour = s.colour
    }
    ctx.beginPath()
    s.shape(ctx)
    ctx.fillStyle = s.colour
    ctx.fill()
    ctx.restore()
  })
  ctx.restore()
  // The clamp on top of the canvas and the ledge under it.
  roundRectPath(ctx, -0.05, cv.y - 0.04, 0.1, 0.06, 0.015)
  part(ctx, FACES.frame.face, 'line')
  box(ctx, cv.x - 0.04, e.ledge, cv.w + 0.08, 0.035, FACES.frame, 0.03, true, true, 'line')
  // The brush: resting on the ledge, or lifted to the canvas and painting.
  const air = painting ? smooth(0, STROKES_FROM, play) * (1 - smooth(STROKES_FROM + 3 * STROKE_FOR, 1.5, play)) : 0
  const bx = mix(e.brush.x, cx + tip[0], air)
  const by = mix(e.brush.y, cy + tip[1], air)
  const ba = mix(e.brush.a, -2.2, air)
  ctx.save()
  ctx.translate(bx, by)
  ctx.rotate(ba)
  ctx.beginPath()
  ctx.moveTo(0.06, 0)
  ctx.lineTo(0.26, 0)
  tube(ctx, 0.022, PARTY.woodDark)
  ctx.beginPath()
  ctx.rect(0.035, -0.015, 0.035, 0.03)
  part(ctx, PARTY.silver, 'detail')
  ctx.beginPath()
  ctx.moveTo(0.04, -0.016)
  ctx.quadraticCurveTo(-0.01, -0.012, -0.02, 0)
  ctx.quadraticCurveTo(-0.01, 0.012, 0.04, 0.016)
  ctx.closePath()
  part(ctx, air > 0 ? tipColour : PAINT.blue, 'detail')
  ctx.restore()
  if (fine) {
    // Two pots of paint at its feet.
    for (const [px, colour] of [
      [-0.38, PAINT.red],
      [0.38, PAINT.yellow],
    ] as const) {
      ctx.beginPath()
      ctx.rect(px - 0.05, -0.09, 0.1, 0.09)
      part(ctx, PARTY.silver, 'line')
      ctx.beginPath()
      ctx.ellipse(px, -0.09, 0.05, 0.016, 0, 0, TAU)
      part(ctx, colour, 'detail')
    }
  }
  ctx.restore()
}

/** The painter's idle: the brush held up, dabbing at the air every DAB seconds; the palette in the far hand. */
const DAB = 1.4
const PAINTER_RIG = (t: number): Rig => {
  const stand = posed('stand', t + 2)
  const dab = Math.sin((TAU * t) / DAB)
  return { ...stand, nod: -0.04, shoulder: [-0.95, 1.55 + 0.15 * dab], elbow: [0.15, 1.0 - 0.2 * dab] }
}
/** Paint on the painter's shirt, in the upper body's frame. */
const SPLATS = [
  { x: 0.03, y: -0.45, r: 0.026, colour: PAINT.pink },
  { x: -0.07, y: -0.53, r: 0.02, colour: PAINT.blue },
  { x: 0.09, y: -0.38, r: 0.016, colour: PAINT.yellow },
] as const

/** A friend in a red beret and paint-spotted clothes, a palette in one hand, dabbing at the air with a brush. A tap: they giggle, hop, and the brush flicks drops of paint. */
const painter: ItemDraw = (ctx, t, play) => {
  const look = FRIENDS[WHO.painter]!
  const fine = detail(1.15) !== 'S'
  const k = held(play, 0.1, 0.55, 0.8)
  const giggle = play >= 0 && play < 1.2
  const base = PAINTER_RIG(t)
  const hop = giggle ? posed('hop', play) : base
  // A little hop of a giggle: half the rig's hop, the painting arm kept up.
  const rig = giggle ? { ...mixRig(base, { ...hop, lift: hop.lift * 0.5, shoulder: base.shoulder, elbow: base.elbow }, k), eyes: 'happy' as const, mouth: play < 1.0 } : base
  drawFriend(ctx, look, rig, 1, (layer) => {
    inRig(ctx, rig, layer === 'behind' ? 'upper' : 'head', () => {
      if (layer === 'behind') {
        // The palette in the far hand, behind the body.
        const h = handAt(rig, 0)
        ctx.save()
        ctx.translate(h.x - 0.04, h.y + 0.01)
        ctx.rotate(-0.3)
        ctx.beginPath()
        ctx.ellipse(0, 0, 0.11, 0.065, 0, 0, TAU)
        part(ctx, PARTY.wood, 'line')
        if (fine)
          for (const [i, colour] of [PAINT.red, PAINT.yellow, PAINT.blue, PAINT.green].entries()) {
            circlePath(ctx, -0.07 + i * 0.045, -0.02 + (i % 2) * 0.03, 0.017)
            ctx.fillStyle = colour
            ctx.fill()
          }
        ctx.restore()
        return
      }
      // The beret.
      ctx.save()
      ctx.translate(HEAD.x - 0.02, HEAD.y - HEAD.r - 0.06)
      ctx.rotate(-0.2)
      ctx.beginPath()
      ctx.ellipse(0, 0, 0.17, 0.065, 0, 0, TAU)
      part(ctx, PARTY.beret, 'line')
      ctx.beginPath()
      ctx.moveTo(0.01, -0.06)
      ctx.lineTo(0.02, -0.095)
      ctx.lineCap = 'round'
      tube(ctx, 0.014, PARTY.beret)
      ctx.restore()
    })
    if (layer === 'behind') return
    inRig(ctx, rig, 'upper', () => {
      if (fine)
        for (const s of SPLATS) {
          circlePath(ctx, s.x, s.y, s.r)
          ctx.moveTo(s.x + s.r * 1.6 + s.r * 0.4, s.y - s.r)
          ctx.arc(s.x + s.r * 1.6, s.y - s.r, s.r * 0.4, 0, TAU)
          ctx.fillStyle = s.colour
          ctx.fill()
        }
      const h = handAt(rig, 1)
      const flick = giggle ? 0.9 * Math.sin(Math.PI * clamp01(play / 0.4)) : 0
      ctx.save()
      ctx.translate(h.x, h.y)
      ctx.rotate(0.35 + flick)
      ctx.beginPath()
      ctx.moveTo(0, 0.05)
      ctx.lineTo(0, -0.15)
      ctx.lineCap = 'round'
      tube(ctx, 0.02, PARTY.woodDark)
      ctx.beginPath()
      ctx.rect(-0.014, -0.18, 0.028, 0.035)
      part(ctx, PARTY.silver, 'detail')
      ctx.beginPath()
      ctx.moveTo(-0.015, -0.18)
      ctx.quadraticCurveTo(-0.012, -0.23, 0, -0.245)
      ctx.quadraticCurveTo(0.012, -0.23, 0.015, -0.18)
      ctx.closePath()
      part(ctx, PAINT.blue, 'detail')
      ctx.restore()
      mitten(ctx, look, h.x, h.y, 1)
    })
  })
  if (play >= 0) spray(ctx, play - 0.15, 0.28, -0.9, 5, 0.5, 0.4, 0.2, 1.4, 0.9, 0.065, 'drop', [PAINT.blue, PAINT.pink, PAINT.yellow, PAINT.green], 3)
}

/** The craft table: its top slab and legs, the crayon cup on it, and the glitter jar. */
const TABLE = { x: -0.44, y: -0.4, w: 0.76, h: 0.06, d: 0.1 } as const
const CUP = { x: -0.38, w: 0.18, h: 0.2 } as const
const JAR = { x: 0.06, w: 0.22, h: 0.27 } as const
const CRAYONS = [
  { dx: -0.05, a: -0.2, colour: PAINT.red },
  { dx: -0.005, a: -0.05, colour: PAINT.yellow },
  { dx: 0.04, a: 0.1, colour: PAINT.green },
] as const

/**
 * A little yellow table with a cup of crayons and scissors, a drawing, and a jar of glitter
 * twinkling. A tap (the renderer shakes it) pops the jar's lid and puffs glitter up into the
 * air, and the crayons jump.
 */
const craftTable: ItemDraw = (ctx, t, play) => {
  const fine = detail(1.15) !== 'S'
  const tb = TABLE
  const surface = tb.y - tb.d / 2
  const shift = tb.d / 2
  const p = play >= 0 && play < 1.6 ? play : -1
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  groundShadow(ctx, 0.85)
  // The far legs, the near legs, the top.
  ctx.beginPath()
  for (const x of [tb.x + 0.05 + tb.d, tb.x + tb.w - 0.05 + tb.d * 0.6]) {
    ctx.moveTo(x, tb.y - tb.d * 0.6)
    ctx.lineTo(x, -tb.d * 0.6)
  }
  tube(ctx, 0.035, BOX.cobalt.side)
  ctx.beginPath()
  for (const x of [tb.x + 0.05, tb.x + tb.w - 0.05]) {
    ctx.moveTo(x, tb.y)
    ctx.lineTo(x, -0.02)
  }
  tube(ctx, 0.04, BOX.cobalt.face)
  box(ctx, tb.x, tb.y, tb.w, tb.h, BOX.yellow, tb.d, true, true, 'line')
  // A drawing lying on the table.
  if (fine) {
    ctx.beginPath()
    ctx.moveTo(-0.17, tb.y - 0.01)
    ctx.lineTo(0.06, tb.y - 0.01)
    ctx.lineTo(0.06 + 0.07, tb.y - 0.08)
    ctx.lineTo(-0.17 + 0.07, tb.y - 0.08)
    ctx.closePath()
    part(ctx, PARTY.paper, 'detail')
    ctx.save()
    ctx.translate(-0.02, tb.y - 0.045)
    ctx.scale(1, 0.35)
    heartPath(ctx, 0, 0, 0.07)
    ctx.fillStyle = PAINT.red
    ctx.fill()
    ctx.restore()
  }
  // The cup of crayons and scissors.
  const cupX = CUP.x + shift
  const hop = (i: number) => (p < 0 ? 0 : 0.05 * arch(clamp01((p - 0.05 - i * 0.07) / 0.35)))
  for (const [i, c] of CRAYONS.entries()) {
    const bx = cupX + CUP.w / 2 + c.dx
    const by = surface - CUP.h * 0.5 - hop(i)
    ctx.save()
    ctx.translate(bx, by)
    ctx.rotate(c.a)
    ctx.beginPath()
    ctx.moveTo(-0.022, 0)
    ctx.lineTo(-0.022, -0.23)
    ctx.lineTo(0, -0.285)
    ctx.lineTo(0.022, -0.23)
    ctx.lineTo(0.022, 0)
    ctx.closePath()
    part(ctx, c.colour, 'detail')
    ctx.restore()
  }
  if (fine) {
    // The scissors' handles poking out of the cup.
    ctx.save()
    ctx.translate(cupX + CUP.w - 0.01, surface - CUP.h - 0.02 - hop(3))
    ctx.rotate(0.35)
    for (const dx of [-0.027, 0.027]) {
      ctx.beginPath()
      ctx.ellipse(dx, -0.035, 0.024, 0.036, dx * 8, 0, TAU)
      tube(ctx, 0.012, PARTY.scissors)
    }
    ctx.restore()
  }
  box(ctx, cupX, surface - CUP.h, CUP.w, CUP.h, BOX.cobalt, 0.03, true, true, 'line')
  // The glitter jar: glass, glitter in its bottom, a lid that pops on a tap.
  const jx = JAR.x + shift
  const jy = surface - JAR.h
  roundRectPath(ctx, jx, jy, JAR.w, JAR.h, 0.03)
  ctx.fillStyle = MATERIAL_LOOK.glass.face
  ctx.fill()
  ctx.save()
  roundRectPath(ctx, jx, jy, JAR.w, JAR.h, 0.03)
  ctx.clip()
  ctx.beginPath()
  ctx.rect(jx, jy + JAR.h * 0.42, JAR.w, JAR.h)
  ctx.fillStyle = PARTY.glitter
  ctx.fill()
  if (fine)
    for (let i = 0; i < 8; i++) {
      circlePath(ctx, jx + 0.03 + (i % 4) * 0.047, jy + JAR.h * 0.56 + Math.floor(i / 4) * 0.055, 0.013)
      ctx.fillStyle = C.confetti[(i + step(t, 0.7, 6)) % 6]!
      ctx.fill()
    }
  ctx.restore()
  roundRectPath(ctx, jx, jy, JAR.w, JAR.h, 0.03)
  ink(ctx, 'line')
  shine(ctx, jx + JAR.w * 0.35, jy + JAR.h * 0.4, JAR.w * 0.45)
  const lift = p < 0 ? 0 : 0.09 * arch(clamp01(p / 0.45))
  roundRectPath(ctx, jx - 0.012, jy - 0.045 - lift, JAR.w + 0.024, 0.05, 0.015)
  part(ctx, PARTY.lid, 'line')
  if (fine) sparkle(ctx, jx + JAR.w * 0.7, jy + JAR.h * 0.6, 0.06 * swell(loop(t, 1.9, 0.2)), C.sparkle)
  if (p >= 0) spray(ctx, p - 0.08, jx + JAR.w / 2, jy - 0.06, 12, 0, 0.95, 0.36, 0.25, 1.4, 0.1, 'glitter', C.confetti, 4)
  ctx.restore()
}

// ---------------------------------------------------------------------------------------
// The themes

/**
 * A theme's items as the renderer calls them, `play` held to what the drawings expect: a
 * tap's age in seconds, or -1 for never (an age of Infinity is never too).
 */
function items<K extends string>(draws: Record<K, ItemDraw>): Record<K, ItemDraw> {
  const out = {} as Record<K, ItemDraw>
  for (const id of Object.keys(draws) as K[]) out[id] = (ctx, t, play) => draws[id](ctx, t, Number.isFinite(play) ? play : -1)
  return out
}

/** A theme's four wall base colours, for the HUD's paint pot. */
const swatches = (walls: readonly { base: string }[]) => [walls[0]!.base, walls[1]!.base, walls[2]!.base, walls[3]!.base] as const

const birthdayWall: WallDraw = (ctx, w, h, t, variant) => {
  void t
  const c = WALLS.birthday[variant]
  motifWall(ctx, w, h, c.base, c.motif, balloonMotif)
  wallBorder(ctx, w, h, c.border, 'cream')
}
const musicWall: WallDraw = (ctx, w, h, t, variant) => {
  void t
  const c = WALLS.music[variant]
  motifWall(ctx, w, h, c.base, c.motif, (g, i) => {
    g.translate(-0.09, -0.17)
    notePath(g, 0.36, i % 2 === 0)
    g.fill()
  })
  wallBorder(ctx, w, h, c.border, 'wave')
}
const craftsWall: WallDraw = (ctx, w, h, t, variant) => {
  void t
  const c = WALLS.crafts[variant]
  motifWall(ctx, w, h, c.base, c.motif, splatMotif)
  wallBorder(ctx, w, h, c.border, 'zigzag')
}

export const PARTY_ART: { [T in 'disco' | 'birthday' | 'music' | 'crafts']: ThemeArt<T> } = {
  disco: { wall: discoWall, floor: discoFloor, glow: GLOW.disco, swatches: swatches(WALLS.disco), items: items({ discoBall, neonStar, speaker, dancer, djDesk }) },
  birthday: { wall: birthdayWall, floor: birthdayFloor, glow: GLOW.birthday, swatches: swatches(WALLS.birthday), items: items({ balloons, bunting, cake, partyKid, gifts }) },
  music: { wall: musicWall, floor: musicFloor, glow: GLOW.music, swatches: swatches(WALLS.music), items: items({ noteLights, guitar, drumKit, singer, piano }) },
  crafts: { wall: craftsWall, floor: craftsFloor, glow: GLOW.crafts, swatches: swatches(WALLS.crafts), items: items({ paperChain, painting, easel, painter, craftTable }) },
}
