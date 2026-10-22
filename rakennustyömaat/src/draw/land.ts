import type { View } from '../game/camera'
import { DEFAULT_LOOK } from '../game/catalog'
import { groundAt, rect } from '../game/layout'
import { BOULDER_HITS, CROSS_FOR, RAWS, TOOLS, type Biome, type Crosser, type Good, type Raw, type RoadDef, type RoadKind, type Surprise, type Tool } from '../game/model'
import { BALLOON_UP, RAMP, TRAIN_FOR, makeRoad, stopX } from '../game/road'
import { drawCat, type CatCoat } from './animals'
import { drawGood } from './goods'
import {
  BOX,
  C,
  INK,
  MATERIAL_LOOK,
  RAW_LOOK,
  SIZE,
  SKY,
  TAU,
  arch,
  at,
  blob,
  blush,
  box,
  circlePath,
  circlesPath,
  clamp01,
  detail,
  eyes,
  flatSun,
  groundShadow,
  ink,
  loop,
  lw,
  mix,
  part,
  pen,
  phaseOf,
  roundRectPath,
  scaled,
  shine,
  smile,
  smooth,
  sparkle,
  squash,
  tube,
  type Faces,
  type SheetEntry,
} from './look'
import { drawTruck } from './truck'

/**
 * The road's world: the sky and the parallax backdrop of each biome, the ground and the
 * road itself, what stands in front of the truck, the boulders and their cracks, the
 * crossers, the ramp, the present, the surprises, the street sign at the end, and the
 * pictures on the signpost's cards.
 *
 * The road is seen from the side and a little above: the wheels roll on the ground line,
 * the asphalt is a band round it (its back edge higher on the screen, its front edge lower),
 * the back verge runs behind it up to where the backdrop begins, and the field in front of
 * it runs down past the bottom of the screen. Depth across the road is straight up the
 * screen; made things standing on it (the ramp, the present, the sign) are boxes as
 * everywhere. Crossers and the train come from the back and leave toward the viewer.
 *
 * The backdrop has no ink and stays lighter than the play layer: three parallax layers of
 * pieces, each piece belonging to the road x it passes the screen's middle at, so a far
 * layer shows the next biome first and two biomes mix piece by piece where they meet.
 */

// ---------------------------------------------------------------------------------------
// The palette

/** The backdrop's tones, far to near: pale, flat, never inked. */
const BACK = {
  hillFar: C.hillFar,
  hillMid: '#A9DE92',
  hillNear: '#97D683',
  woodFar: '#B5DCC2',
  pineFar: '#A3D2B4',
  pineMid: '#8AC99E',
  pineNear: '#76C08C',
  trunk: '#CDA684',
  bush: '#A5DC8F',
  flower: '#FFF4DC',
  duneFar: '#F7E6BC',
  duneMid: '#F2DAA4',
  duneNear: '#EDD08F',
  dryGrass: '#C9D98C',
  seaFar: '#B3E3F6',
  seaMid: '#97D8F2',
  foam: '#FFFFFF',
  sail: '#FFFFFF',
  sailStripe: '#FF9C9C',
  hull: '#F7BE90',
  river: '#A0DBF3',
  ripple: '#D6F2FC',
  reed: '#A6D07C',
  cattail: '#CDA078',
  mesa: '#EEDFC8',
  terrace: '#E0CBAC',
  ledge: '#F3E8D5',
  stone: '#D8D0C6',
  stoneTop: '#E8E2DA',
  mountainFar: '#CBD5F2',
  mountainMid: '#B9C6EC',
  ridge: '#D3DCF5',
  snow: '#FFFFFF',
  mill: '#FFF4DC',
  millRoof: '#F5B9A6',
  millSail: '#FFF8EA',
  roofs: ['#F6B7A6', '#F8D186', '#ADCFF4', '#D0B9F1'],
  walls: ['#FFF4DC', '#FDEBD9', '#EEF4FB'],
  window: '#D8EFFB',
  umbrella: '#FF9C9C',
  umbrellaStripe: '#FFFFFF',
  pole: '#EADDC6',
  hedge: '#A9DC94',
  lamp: '#E3E7EF',
} as const

/** Each biome's ground: the back verge behind the road, the field in front of it, and the darker tone its marks are drawn in. */
const GROUND: Record<Biome, { verge: string; field: string; mark: string }> = {
  meadow: { verge: BOX.grass.face, field: BOX.grass.face, mark: BOX.grass.side },
  forest: { verge: '#4DAD58', field: '#4DAD58', mark: '#368C44' },
  river: { verge: BOX.grass.face, field: BOX.grass.face, mark: BOX.grass.side },
  dunes: { verge: '#EDCB7E', field: '#F0D38F', mark: '#D3AE62' },
  beach: { verge: '#F0D38F', field: '#F3DB9F', mark: '#D9B970' },
  quarry: { verge: '#C9B396', field: '#CEB99D', mark: '#A88F72' },
  tunnel: { verge: '#B4A091', field: '#B9A697', mark: '#94806F' },
  town: { verge: '#D9DEE6', field: BOX.grass.face, mark: BOX.grass.side },
}

/** The road, its kerbs, the bridge, the tunnel and the level crossing. */
const ROADS = {
  tar: BOX.asphalt.top,
  kerbTop: '#E6E9F0',
  kerbFace: C.kerb,
  slab: '#C3C9D4',
  soil: BOX.soil.face,
  water: '#5EC4EC',
  waterLight: '#A2E0F6',
  bank: BOX.soil.top,
  wall: '#7B6170',
  wallDark: '#6B5262',
  rock: '#B39D90',
  rockDark: '#9D887B',
  cut: '#8C7470',
  cutDark: '#7A6360',
  /** The stones set in the tunnel's wall and in the cut rock: a tone lighter than the rock, a lighter strip on top. */
  stone: '#8E7383',
  stoneTop: '#A38A98',
  cutStone: '#A08884',
  cutStoneTop: '#B39C97',
  lamp: '#FFE08A',
  portal: { face: '#CDBFB2', top: '#E0D6CB', side: '#AB9C8F' } satisfies Faces,
  sleeper: '#A0704A',
  ballast: '#C4BAAE',
  rail: BOX.steel.face,
  crossbuck: '#FF5A5A',
  barrier: '#FF5A5A',
  lampOff: '#B52E26',
  lampOn: '#FF6B5A',
  zebra: '#F4F1E8',
  flowers: ['#FFFFFF', '#FFD93A', '#FF9EBB', '#A77BFF'],
  shell: '#FFD9C9',
  mushroom: '#FF5A5A',
  pebble: '#E3DBD1',
} as const

/** The animals' coats: the duck family, the hedgehogs, the cows (the cats are animals.ts's). */
const COAT = {
  duck: '#FFFFFF',
  duckShade: '#E4E9F2',
  beak: '#FF9F3A',
  duckling: '#FFD93A',
  ducklingShade: '#F0BE1E',
  sign: '#FF5A5A',
  signStick: '#B6C0CF',
  spines: '#8C6440',
  spinesDark: '#6E4B2E',
  hogFace: '#F2D7B0',
  apple: '#FF5A5A',
  leaf: '#4FD36A',
  cow: '#FFFFFF',
  patch: '#3D4258',
  muzzle: '#FFB8C2',
  horn: '#F6E7C8',
  hoof: '#5A4A44',
  calf: '#C98A4E',
  bell: BOX.yellow.face,
} as const

/** The present's wrapping, ribbon and the dots on it. */
const GIFT: Faces & { ribbon: Faces; dot: string } = {
  face: '#FF5C8A',
  top: '#FF8DAE',
  side: '#D93D6C',
  ribbon: BOX.yellow,
  dot: '#FF8DAE',
}

/** The train: the engine, its wagons, the wheels and the smoke. */
const TRAIN = {
  engine: { face: '#E8443A', top: '#EE7A5E', side: '#B52E26' } satisfies Faces,
  roof: BOX.yellow,
  wagons: [BOX.cobalt, { face: '#3FB45A', top: '#6CCB7F', side: '#2A8A41' }] as readonly Faces[],
  chimney: BOX.asphalt.face,
  smoke: '#ECEEF3',
  buffer: BOX.steel.top,
} as const

/** The balloon: its basket and ropes, the scarf of the cat who flies it. */
const BALLOON = {
  basket: MATERIAL_LOOK.planks,
  rope: '#B5733A',
  scarf: '#2E6BE6',
} as const

/** The home sign stands this far up the back verge (y up), its board as high over the road as ever. */
const SIGN_FOOT = -0.82
/** The home sign: the board, its house picture. */
const SIGN = {
  board: BOX.cobalt,
  wall: C.paper,
  roof: MATERIAL_LOOK.bricks.face,
  door: BOX.yellow.face,
  window: C.glassTint,
  grass: BOX.grass.face,
} as const

// ---------------------------------------------------------------------------------------
// The road's measures

/** The road's cross-section in metres from the ground line the wheels roll on (y down): the back verge's top edge, the back kerb, the asphalt, the front kerb's top and face, the soil band under it, and how far down the field runs (past any chunk's bottom). */
const VERGE = -1.0
const KERB_BACK = -0.56
const TAR_BACK = -0.46
const TAR_FRONT = 0.34
const KERB_FACE = 0.4
const SOIL = 0.52
const FIELD = 0.64
const DEEP = 9
/** The lane dashes: their middle across the road, height, length and period along it. */
const DASH = { y: -0.06, h: 0.07, len: 1.5, every: 3 }
/** A zebra crossing at each family's crossing, this wide. */
const ZEBRA_W = 2.4
/** The near rail along each plank bridge (RoadDef.bridges), this high: low enough for the wheels to show over it. */
const RAIL_H = 0.56
/** Tunnels: bores BORE long (under 3 s at top speed), the first BORE_IN into the tunnel stretch, BORE_GAP apart; the ceiling CEIL over the ground line; the mountain's shoulders SHOULDER wide. */
const BORE = 18
const BORE_IN = 8
const BORE_GAP = 14
const CEIL = -3.1
const SHOULDER = 5
/** The vault's corners' radius, the front arch's portals' width and its rim's height, the lamps' spacing along the wall. */
const VAULT_R = 1.4
const PORTAL_W = 0.9
const RIM_H = 0.55
const LAMP_EVERY = 4.5
/** The level crossing's track runs down-right at TRACK_A across the road, through the road's middle at the train's x, its rails `gauge` either side of its middle and its ballast `ballast`. */
const TRACK_A = (20 * Math.PI) / 180
const TRACK = { cos: Math.cos(TRACK_A), sin: Math.sin(TRACK_A), gauge: 0.3, ballast: 0.42 }
/** The track's ends, metres along it from the road's middle: the back verge's top edge, and past the bottom of any view. */
const RAILS = { from: (VERGE + 0.04 - DASH.y) / TRACK.sin, to: (DEEP - DASH.y) / TRACK.sin }
/** How far the level crossing's track reaches left of the crossing's x (negative): its ballast's back corner on the back verge (road.ts stops the truck clear of it). */
export const TRACK_LEFT = RAILS.from * TRACK.cos - TRACK.ballast * TRACK.sin
/** The barrier stands on the field in front, BARRIER_X right of the crossing's x; the crossbuck on the back verge, clear of the bush. */
const BARRIER = { x: 0.55, y: 0.78, h: 0.95, arm: 1.45 }
const CROSSBUCK = { x: -0.8, y: -0.82, h: 1.5 }
/** The bush on the back verge over the track's back end, as (x, y, r) circles from the crossing's x on the ground: the train comes out from behind it, so it covers the track's end from the rails to over the engine's roof. */
const TRACK_BUSH = [-2.95, -1.2, 0.38, -2.45, -1.45, 0.55, -1.95, -1.15, 0.38, -2.2, -1.0, 0.28, -2.0, -1.9, 0.48, -2.55, -2.05, 0.42, -1.85, -2.38, 0.36] as const
/** Ground features reach at most this far past their own x, so a chunk draws everything from that far beyond its span. */
const REACH = SHOULDER + 1

/** The biome at road x (the first one before the start, the last one past the end). */
function biomeAt(def: RoadDef, x: number): Biome {
  for (const b of def.biomes) if (x < b.to) return b.biome
  return def.biomes[def.biomes.length - 1]!.biome
}
/** A number from 0 to 1 for two integers, the same every time: where a piece or a mark goes, and what it is. */
function hash(a: number, b: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul((b | 0) + 0x9e37, 0x165667b1)
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d)
  h ^= h >>> 12
  h = Math.imul(h, 0x297a2d39)
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296
}
/** A stretch of the road, from and to in metres: a bridge (RoadDef.bridges) or a tunnel bore. */
type Span = RoadDef['bridges'][number]
/** The tunnel bores in each tunnel stretch; a short stretch gets one bore in its middle. */
function boresOf(def: RoadDef): Span[] {
  const out: Span[] = []
  for (const b of def.biomes) {
    if (b.biome !== 'tunnel') continue
    if (b.to - b.from < BORE + 2 * BORE_IN) out.push({ from: (b.from + b.to - BORE) / 2, to: (b.from + b.to + BORE) / 2 })
    else for (let a = b.from + BORE_IN; a + BORE <= b.to - BORE_IN; a += BORE + BORE_GAP) out.push({ from: a, to: a + BORE })
  }
  return out
}
const within = (spans: readonly Span[], x: number) => spans.some((span) => x >= span.from && x <= span.to)

/** Traces the ground line from a to b offset `dy` (metre by metre, as groundAt runs), continuing the current path; `first` starts it. */
function along(ctx: CanvasRenderingContext2D, def: RoadDef, a: number, b: number, dy: number, first: boolean) {
  const xs = [a]
  if (b > a) for (let x = Math.floor(a) + 1; x < b; x++) xs.push(x)
  else for (let x = Math.ceil(a) - 1; x > b; x--) xs.push(x)
  xs.push(b)
  xs.forEach((x, i) => (first && i === 0 ? ctx.moveTo(x, groundAt(def, x) + dy) : ctx.lineTo(x, groundAt(def, x) + dy)))
}
/** A band along the ground from a to b, `top` to `bottom` metres from the ground line, as a fresh closed path. */
function strip(ctx: CanvasRenderingContext2D, def: RoadDef, a: number, b: number, top: number, bottom: number) {
  ctx.beginPath()
  along(ctx, def, a, b, top, true)
  along(ctx, def, b, a, bottom, false)
  ctx.closePath()
}
/** Fills a band along the ground flat in `colour`. */
function band(ctx: CanvasRenderingContext2D, def: RoadDef, a: number, b: number, top: number, bottom: number, colour: string) {
  strip(ctx, def, a, b, top, bottom)
  ctx.fillStyle = colour
  ctx.fill()
}
/** Strokes the ground line from a to b offset `dy` in ink. */
function inkLine(ctx: CanvasRenderingContext2D, def: RoadDef, a: number, b: number, dy: number, weight: 'line' | 'detail') {
  ctx.beginPath()
  along(ctx, def, a, b, dy, true)
  ink(ctx, weight)
}

// ---------------------------------------------------------------------------------------
// The backdrop

/** The backdrop's three layers, far to near: how much of the camera's move each follows, how far apart its pieces stand (layer metres), and its base under the camera's ground. */
const LAYERS = [
  { p: 0.12, step: 6.5, base: -1.75 },
  { p: 0.3, step: 4.4, base: -1.4 },
  { p: 0.56, step: 3.1, base: -1.1 },
] as const
/** Two biomes mix their pieces over this many road metres either side of where they meet. */
const MIX = 14
/** The sky's band edges, as fractions of the way down to the horizon; the horizon is HORIZON over the camera's ground. */
const BANDS = [0.4, 0.7] as const
const HORIZON = -1.75
/** Clouds: a slot every CLOUD_EVERY layer metres (some empty), following CLOUD_P of the camera's move and drifting CLOUD_DRIFT m/s. */
const CLOUD_EVERY = 8
const CLOUD_P = 0.04
const CLOUD_DRIFT = 0.15
/** A cloud's puffs over its flat bottom, about 2 units wide (each cloud scales it by its own size in metres). */
const CLOUD = [-0.52, 0.02, 0.36, -0.05, -0.26, 0.5, 0.48, -0.04, 0.38] as const

/** The biome a backdrop piece shows for road x: near where two biomes meet, either one, as the piece's own number `h` decides. */
function mixedBiome(def: RoadDef, x: number, h: number): Biome {
  const bs = def.biomes
  for (let i = 0; i < bs.length; i++) {
    const b = bs[i]!
    if (x >= b.to && i < bs.length - 1) continue
    if (i > 0 && x < b.from + MIX) return h < smooth(b.from - MIX, b.from + MIX, x) ? b.biome : bs[i - 1]!.biome
    if (i < bs.length - 1 && x > b.to - MIX) return h < smooth(b.to - MIX, b.to + MIX, x) ? bs[i + 1]!.biome : b.biome
    return b.biome
  }
  return bs[bs.length - 1]!.biome
}

/** A soft hill `w` metres either side of the origin and `h` high, its flanks running down `down` metres (to the screen's bottom): a fresh path. */
function hillPath(ctx: CanvasRenderingContext2D, w: number, h: number, down: number) {
  ctx.beginPath()
  ctx.moveTo(-w, down)
  ctx.lineTo(-w, 0)
  ctx.bezierCurveTo(-w * 0.55, 0, -w * 0.45, -h, 0, -h)
  ctx.bezierCurveTo(w * 0.45, -h, w * 0.55, 0, w, 0)
  ctx.lineTo(w, down)
  ctx.closePath()
}
const flat = (ctx: CanvasRenderingContext2D, colour: string) => {
  ctx.fillStyle = colour
  ctx.fill()
}
/** Circles (x, y, r triples) filled flat as one shape, no ink: the backdrop's trees, bushes and stones. */
function puffs(ctx: CanvasRenderingContext2D, xyr: readonly number[], colour: string) {
  circlesPath(ctx, xyr)
  flat(ctx, colour)
}
/** A pine of `h` metres standing at x: a trunk and three stacked tiers. */
function pine(ctx: CanvasRenderingContext2D, x: number, h: number, colour: string, trunk: string) {
  ctx.fillStyle = trunk
  ctx.fillRect(x - h * 0.05, -h * 0.22, h * 0.1, h * 0.24)
  ctx.beginPath()
  for (let i = 0; i < 3; i++) {
    const y0 = -h * (0.18 + i * 0.24)
    const w = h * (0.34 - i * 0.07)
    ctx.moveTo(x - w, y0)
    ctx.lineTo(x, y0 - h * 0.42)
    ctx.lineTo(x + w, y0)
    ctx.closePath()
  }
  flat(ctx, colour)
}
/** A little house of the backdrop town: walls `w` by `h`, a roof, two windows. */
function farHouse(ctx: CanvasRenderingContext2D, x: number, w: number, h: number, wall: string, roof: string) {
  ctx.fillStyle = wall
  ctx.fillRect(x - w / 2, -h, w, h + 2)
  ctx.beginPath()
  ctx.moveTo(x - w / 2 - 0.12, -h)
  ctx.lineTo(x, -h - w * 0.55)
  ctx.lineTo(x + w / 2 + 0.12, -h)
  ctx.closePath()
  flat(ctx, roof)
  ctx.fillStyle = BACK.window
  for (const k of [-0.22, 0.22]) ctx.fillRect(x + k * w - w * 0.1, -h * 0.68, w * 0.2, h * 0.24)
}

/** One piece of a backdrop layer for a biome, at its base, in metres; `h` is the piece's own number, `down` how far its base is from the screen's bottom. */
function drawPiece(ctx: CanvasRenderingContext2D, layer: number, biome: Biome, h: number, down: number, t: number) {
  const h2 = hash(Math.floor(h * 1e6), 3)
  if (layer === 0) {
    switch (biome) {
      case 'meadow':
      case 'river':
      case 'town':
        hillPath(ctx, 6 + 2 * h, 1.4 + 1.6 * h2, down)
        flat(ctx, BACK.hillFar)
        if (biome === 'town') for (let i = 0; i < 3; i++) farHouse(ctx, -1.6 + i * 1.3 + h * 0.4, 0.7, 0.55 + 0.25 * hash(i, Math.floor(h * 1e5)), BACK.walls[i % 3]!, BACK.roofs[(i + Math.floor(h * 4)) % 4]!)
        return
      case 'forest':
        hillPath(ctx, 6.5, 1.8 + 1.2 * h2, down)
        flat(ctx, BACK.woodFar)
        for (let i = 0; i < 5; i++) pine(ctx, -2.6 + i * 1.3 + h * 0.5, 0.9 + 0.5 * hash(i, Math.floor(h * 1e5)), BACK.pineFar, BACK.pineFar)
        return
      case 'dunes':
        ctx.beginPath()
        ctx.moveTo(-6.5, down)
        ctx.lineTo(-6.5, 0)
        ctx.bezierCurveTo(-3, 0, -2, -1.1 - 0.6 * h2, 0.6, -1.1 - 0.6 * h2)
        ctx.bezierCurveTo(2, -1.1 - 0.6 * h2, 3, 0, 6.5, 0)
        ctx.lineTo(6.5, down)
        ctx.closePath()
        flat(ctx, BACK.duneFar)
        return
      case 'beach':
        ctx.fillStyle = BACK.seaFar
        ctx.fillRect(-6, -0.2, 12, down + 0.2)
        if (h > 0.6) {
          ctx.save()
          ctx.translate(h * 3 - 1.5, -0.2)
          hillPath(ctx, 1.4, 0.55, 0.2)
          flat(ctx, BACK.hillFar)
          ctx.restore()
        }
        return
      case 'quarry':
        ctx.beginPath()
        ctx.moveTo(-6, down)
        ctx.lineTo(-6, 0)
        ctx.lineTo(-4.2, -2.2 - h2)
        ctx.lineTo(1.4, -2.2 - h2)
        ctx.lineTo(2.2, -1.5 - h2 * 0.6)
        ctx.lineTo(3.6, -1.5 - h2 * 0.6)
        ctx.lineTo(6, 0)
        ctx.lineTo(6, down)
        ctx.closePath()
        flat(ctx, BACK.mesa)
        return
      case 'tunnel': {
        const top = 3.6 + 1.6 * h2
        ctx.beginPath()
        ctx.moveTo(-6, down)
        ctx.lineTo(-6, 0)
        ctx.quadraticCurveTo(-1.6, -top * 0.6, -0.4, -top + 0.15)
        ctx.quadraticCurveTo(0, -top - 0.12, 0.4, -top + 0.15)
        ctx.quadraticCurveTo(1.8, -top * 0.6, 6, 0)
        ctx.lineTo(6, down)
        ctx.closePath()
        flat(ctx, BACK.mountainFar)
        ctx.beginPath()
        ctx.moveTo(-0.95, -top + 0.82)
        ctx.quadraticCurveTo(-0.5, -top + 0.05, 0, -top - 0.04)
        ctx.quadraticCurveTo(0.5, -top + 0.05, 1.0, -top + 0.86)
        ctx.lineTo(0.55, -top + 0.66)
        ctx.lineTo(0.2, -top + 0.9)
        ctx.lineTo(-0.3, -top + 0.64)
        ctx.closePath()
        flat(ctx, BACK.snow)
        return
      }
    }
  }
  if (layer === 1) {
    switch (biome) {
      case 'meadow': {
        const top = 0.9 + 0.8 * h2
        hillPath(ctx, 4, top, down)
        flat(ctx, BACK.hillMid)
        if (h < 0.2) drawWindmill(ctx, 0.4, -top + 0.12, t + h * 9)
        return
      }
      case 'forest':
        hillPath(ctx, 3.4, 0.5, down)
        flat(ctx, BACK.pineMid)
        for (let i = 0; i < 3; i++) pine(ctx, -1.4 + i * 1.4 + (hash(i, Math.floor(h * 1e5)) - 0.5) * 0.4, 1.6 + 0.9 * hash(i + 5, Math.floor(h * 1e5)), BACK.pineMid, BACK.trunk)
        return
      case 'river':
        hillPath(ctx, 3.4, 0.45 + 0.35 * h2, down)
        flat(ctx, BACK.hillMid)
        if (h < 0.5) {
          ctx.fillStyle = BACK.trunk
          ctx.fillRect(0.3, -1.4, 0.14, 1.2)
          puffs(ctx, [0.37, -1.6, 0.42, 0.0, -1.3, 0.3, 0.7, -1.32, 0.3], BACK.bush)
        }
        // The river along the far bank, its ripples drifting.
        ctx.fillStyle = BACK.river
        ctx.fillRect(-4, -0.12, 8, down + 0.12)
        ctx.fillStyle = BACK.ripple
        for (let i = 0; i < 3; i++) {
          const x = (((i * 2.7 + h * 4 + t * 0.25) % 8) + 8) % 8 - 4
          ctx.fillRect(x, 0.05 + i * 0.09, 0.5, 0.035)
        }
        return
      case 'dunes': {
        hillPath(ctx, 3.8, 0.7 + 0.5 * h2, down)
        flat(ctx, BACK.duneMid)
        ctx.strokeStyle = BACK.dryGrass
        ctx.lineWidth = 0.05
        ctx.lineCap = 'round'
        ctx.beginPath()
        for (const dx of [-0.12, 0, 0.12]) {
          ctx.moveTo(h * 2 - 1 + dx, -0.72 - 0.5 * h2 + 0.15)
          ctx.lineTo(h * 2 - 1 + dx * 2.2, -0.72 - 0.5 * h2 - 0.25)
        }
        ctx.stroke()
        return
      }
      case 'beach': {
        ctx.fillStyle = BACK.seaMid
        ctx.fillRect(-4, -0.8, 8, down + 0.8)
        // Foam crests bobbing on the sea.
        ctx.fillStyle = BACK.foam
        for (let i = 0; i < 3; i++) {
          const x = -3 + i * 2.2 + h * 1.2
          const y = -0.5 + 0.03 * Math.sin(TAU * (t / 2.6 + i * 0.3 + h)) + (i % 2) * 0.18
          ctx.beginPath()
          ctx.ellipse(x, y, 0.28, 0.035, 0, 0, TAU)
          ctx.fill()
        }
        if (h < 0.32) {
          const bob = 0.04 * Math.sin(TAU * (t / 3 + h))
          ctx.save()
          ctx.translate(0.5, -0.74 + bob)
          ctx.rotate(0.03 * Math.sin(TAU * (t / 3 + h + 0.25)))
          ctx.beginPath()
          ctx.moveTo(-0.5, -0.14)
          ctx.lineTo(0.55, -0.14)
          ctx.quadraticCurveTo(0.42, 0.08, 0.3, 0.08)
          ctx.lineTo(-0.36, 0.08)
          ctx.closePath()
          flat(ctx, BACK.hull)
          ctx.beginPath()
          ctx.moveTo(0.02, -0.18)
          ctx.lineTo(0.02, -1.15)
          ctx.lineTo(0.48, -0.2)
          ctx.closePath()
          flat(ctx, BACK.sail)
          ctx.beginPath()
          ctx.moveTo(0.02, -0.5)
          ctx.lineTo(0.02, -0.7)
          ctx.lineTo(0.31, -0.55)
          ctx.lineTo(0.38, -0.4)
          ctx.closePath()
          flat(ctx, BACK.sailStripe)
          ctx.restore()
        }
        return
      }
      case 'quarry': {
        // Terraced walls: three steps, each with its lighter ledge.
        const top = 2.1 + 0.6 * h2
        ctx.beginPath()
        ctx.moveTo(-3.8, down)
        ctx.lineTo(-3.8, 0)
        ctx.lineTo(-3.4, -top / 3)
        ctx.lineTo(-2.6, -top / 3)
        ctx.lineTo(-2.2, (-top * 2) / 3)
        ctx.lineTo(-1.4, (-top * 2) / 3)
        ctx.lineTo(-1.0, -top)
        ctx.lineTo(1.4, -top)
        ctx.lineTo(1.8, (-top * 2) / 3)
        ctx.lineTo(2.6, (-top * 2) / 3)
        ctx.lineTo(3.0, -top / 3)
        ctx.lineTo(3.8, -top / 3)
        ctx.lineTo(4.2, 0)
        ctx.lineTo(4.2, down)
        ctx.closePath()
        flat(ctx, BACK.terrace)
        ctx.fillStyle = BACK.ledge
        for (const [x0, x1, y] of [
          [-3.4, -2.6, -top / 3],
          [-2.2, -1.4, (-top * 2) / 3],
          [-1.0, 1.4, -top],
          [1.8, 2.6, (-top * 2) / 3],
          [3.0, 3.8, -top / 3],
        ] as const)
          ctx.fillRect(x0, y, x1 - x0, 0.12)
        return
      }
      case 'tunnel': {
        const top = 2.6 + 1.2 * h2
        ctx.beginPath()
        ctx.moveTo(-4.2, down)
        ctx.lineTo(-4.2, 0)
        ctx.quadraticCurveTo(-1.2, -top * 0.7, 0, -top)
        ctx.quadraticCurveTo(1.4, -top * 0.6, 4.2, 0)
        ctx.lineTo(4.2, down)
        ctx.closePath()
        flat(ctx, BACK.mountainMid)
        // The lit face down the left of the ridge.
        ctx.beginPath()
        ctx.moveTo(0, -top)
        ctx.quadraticCurveTo(-1.2, -top * 0.7, -4.2, 0)
        ctx.lineTo(-1.2, 0)
        ctx.quadraticCurveTo(-0.6, -top * 0.5, 0, -top)
        ctx.closePath()
        flat(ctx, BACK.ridge)
        return
      }
      case 'town':
        hillPath(ctx, 3.4, 0.4, down)
        flat(ctx, BACK.hillMid)
        for (let i = 0; i < 2; i++) farHouse(ctx, -0.9 + i * 1.9, 1.3, 0.95 + 0.4 * hash(i, Math.floor(h * 1e5)), BACK.walls[(i + Math.floor(h * 3)) % 3]!, BACK.roofs[(i * 2 + Math.floor(h * 4)) % 4]!)
        return
    }
  }
  switch (biome) {
    case 'meadow':
      hillPath(ctx, 2.6, 0.3, down)
      flat(ctx, BACK.hillNear)
      if (h < 0.5) {
        ctx.fillStyle = BACK.trunk
        ctx.fillRect(-0.08, -1.0, 0.16, 0.9)
        puffs(ctx, [0, -1.3, 0.5, -0.38, -0.95, 0.36, 0.4, -0.98, 0.36], BACK.bush)
      } else {
        puffs(ctx, [-0.3, -0.3, 0.3, 0.1, -0.42, 0.36, 0.5, -0.28, 0.28], BACK.bush)
        ctx.fillStyle = BACK.flower
        for (const [x, y] of [
          [-0.25, -0.45],
          [0.2, -0.6],
          [0.5, -0.38],
        ] as const) {
          ctx.beginPath()
          ctx.arc(x, y, 0.05, 0, TAU)
          ctx.fill()
        }
      }
      return
    case 'forest':
      hillPath(ctx, 2.2, 0.35, down)
      flat(ctx, BACK.pineNear)
      pine(ctx, (h - 0.5) * 0.8, 2.6 + 1.0 * h2, BACK.pineNear, BACK.trunk)
      return
    case 'river': {
      ctx.fillStyle = BACK.river
      ctx.fillRect(-2.4, -0.1, 4.8, down + 0.1)
      // Reeds: stalks and cattails swaying a little.
      const sway = 0.05 * Math.sin(TAU * (t / 2.8 + h))
      ctx.lineCap = 'round'
      ctx.lineWidth = 0.05
      ctx.strokeStyle = BACK.reed
      ctx.beginPath()
      for (let i = 0; i < 6; i++) {
        const x = -0.9 + i * 0.32 + (hash(i, Math.floor(h * 1e5)) - 0.5) * 0.15
        const top = 0.8 + 0.5 * hash(i + 9, Math.floor(h * 1e5))
        ctx.moveTo(x, 0.05)
        ctx.quadraticCurveTo(x, -top * 0.5, x + sway * top, -top)
      }
      ctx.stroke()
      ctx.fillStyle = BACK.cattail
      for (let i = 0; i < 6; i += 2) {
        const x = -0.9 + i * 0.32 + (hash(i, Math.floor(h * 1e5)) - 0.5) * 0.15
        const top = 0.8 + 0.5 * hash(i + 9, Math.floor(h * 1e5))
        ctx.beginPath()
        ctx.ellipse(x + sway * top * 0.85, -top * 0.85, 0.05, 0.13, 0, 0, TAU)
        ctx.fill()
      }
      return
    }
    case 'dunes':
      hillPath(ctx, 2.4, 0.45 + 0.3 * h2, down)
      flat(ctx, BACK.duneNear)
      // A little sand fence.
      ctx.fillStyle = BACK.pole
      for (let i = 0; i < 4; i++) ctx.fillRect(-0.9 + i * 0.3, -0.75 - 0.3 * h2 + Math.abs(i - 1.5) * 0.05, 0.07, 0.5)
      return
    case 'beach':
      hillPath(ctx, 2.4, 0.3, down)
      flat(ctx, BACK.duneNear)
      if (h < 0.34) {
        ctx.fillStyle = BACK.pole
        ctx.fillRect(-0.03, -1.45, 0.06, 1.2)
        ctx.save()
        ctx.translate(0, -1.4)
        ctx.rotate(-0.12)
        for (let i = 0; i < 6; i++) {
          ctx.beginPath()
          ctx.moveTo(0, 0)
          ctx.arc(0, 0, 0.75, Math.PI + (i * Math.PI) / 6, Math.PI + ((i + 1) * Math.PI) / 6)
          ctx.closePath()
          flat(ctx, i % 2 === 0 ? BACK.umbrella : BACK.umbrellaStripe)
        }
        ctx.restore()
      } else if (h < 0.62) {
        // A sandcastle with a flag.
        ctx.fillStyle = BACK.duneMid
        ctx.fillRect(-0.4, -0.75, 0.8, 0.55)
        ctx.fillRect(-0.52, -0.95, 0.3, 0.75)
        ctx.fillRect(0.22, -0.95, 0.3, 0.75)
        ctx.fillStyle = BACK.pole
        ctx.fillRect(0.35, -1.35, 0.03, 0.42)
        ctx.beginPath()
        ctx.moveTo(0.38, -1.35)
        ctx.lineTo(0.62, -1.27)
        ctx.lineTo(0.38, -1.19)
        ctx.closePath()
        flat(ctx, BACK.umbrella)
      }
      return
    case 'quarry':
      hillPath(ctx, 2.4, 0.3, down)
      flat(ctx, BACK.terrace)
      // A pile of faceted stones, each with its lit top.
      for (const [x, y, r] of [
        [-0.55, 0, 0.36],
        [0.5, 0, 0.32],
        [0.0, 0, 0.5],
        [-0.15, -0.62, 0.3],
      ] as const) {
        ctx.beginPath()
        ctx.moveTo(x - r, y)
        ctx.lineTo(x - r * 0.9, y - r * 0.8)
        ctx.lineTo(x - r * 0.2, y - r * 1.25)
        ctx.lineTo(x + r * 0.75, y - r * 0.95)
        ctx.lineTo(x + r, y)
        ctx.closePath()
        flat(ctx, BACK.stone)
        ctx.beginPath()
        ctx.moveTo(x - r * 0.9, y - r * 0.8)
        ctx.lineTo(x - r * 0.2, y - r * 1.25)
        ctx.lineTo(x + r * 0.75, y - r * 0.95)
        ctx.lineTo(x + r * 0.1, y - r * 0.7)
        ctx.closePath()
        flat(ctx, BACK.stoneTop)
      }
      return
    case 'tunnel':
      hillPath(ctx, 2.6, 0.9 + 0.5 * h2, down)
      flat(ctx, BACK.stone)
      puffs(ctx, [-0.8, -0.9 - 0.3 * h2, 0.3, 0.7, -0.75 - 0.3 * h2, 0.26], BACK.stoneTop)
      return
    case 'town':
      hillPath(ctx, 2.4, 0.25, down)
      flat(ctx, BACK.hillNear)
      puffs(ctx, [-0.9, -0.32, 0.3, -0.45, -0.38, 0.34, 0.0, -0.34, 0.3], BACK.hedge)
      ctx.fillStyle = BACK.lamp
      ctx.fillRect(0.75, -2.0, 0.08, 1.95)
      ctx.beginPath()
      ctx.arc(0.79, -2.05, 0.17, Math.PI, TAU)
      ctx.closePath()
      flat(ctx, BACK.lamp)
      return
  }
}

/** The backdrop's windmill: a tapering tower, a cap and four sails turning slowly; origin at its foot. */
function drawWindmill(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.beginPath()
  ctx.moveTo(-0.36, 0)
  ctx.lineTo(-0.24, -1.5)
  ctx.lineTo(0.24, -1.5)
  ctx.lineTo(0.36, 0)
  ctx.closePath()
  flat(ctx, BACK.mill)
  ctx.beginPath()
  ctx.moveTo(-0.32, -1.5)
  ctx.quadraticCurveTo(0, -2.0, 0.32, -1.5)
  ctx.closePath()
  flat(ctx, BACK.millRoof)
  ctx.fillStyle = BACK.millRoof
  ctx.fillRect(-0.09, -0.36, 0.18, 0.36)
  ctx.translate(0, -1.52)
  ctx.rotate((TAU * t) / 9)
  for (let i = 0; i < 4; i++) {
    ctx.rotate(TAU / 4)
    ctx.fillStyle = BACK.millRoof
    ctx.fillRect(0, -0.025, 1.05, 0.05)
    ctx.fillStyle = BACK.millSail
    ctx.fillRect(0.25, 0.02, 0.8, 0.2)
  }
  circlePath(ctx, 0, 0, 0.07)
  flat(ctx, BACK.millRoof)
  ctx.restore()
}

/** The sky and the parallax layers behind the road. It sets its own transforms from the view (the far layers move slower) and restores the context. */
export function drawRoadBackdrop(ctx: CanvasRenderingContext2D, def: RoadDef, view: View, t: number): void {
  const s = view.ppm
  const xc = view.x0 + view.w / 2 / s
  // The ground under the view, averaged as smoothly as the camera rides it, and its height on the screen (CSS px).
  let g = 0
  for (let k = -10; k <= 10; k++) g += groundAt(def, xc + k * 2)
  const ground = (g / 21 - view.y0) * s
  const horizon = ground + HORIZON * s
  const sky = SKY[def.sky]
  ctx.save()
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0)
  // The stepped sky.
  const edges = [0, horizon * BANDS[0], horizon * BANDS[1], view.h]
  sky.bands.forEach((colour, i) => {
    ctx.fillStyle = colour
    ctx.fillRect(0, edges[i]!, view.w, edges[i + 1]! - edges[i]! + 1)
  })
  // The flat sun with its pale ring (the street's sun too), high in the day and low and big at sunset.
  const sunset = def.sky === 'sunset'
  flatSun(ctx, view.w * 0.8, horizon - (sunset ? 1.9 : 4.4) * s, (sunset ? 1.0 : 0.72) * s, sky.sun, sky.halo)
  // White clouds drifting, no ink.
  const lc = CLOUD_P * xc - CLOUD_DRIFT * t
  const half = view.w / 2 / s
  for (let i = Math.floor((lc - half) / CLOUD_EVERY) - 1; i <= Math.ceil((lc + half) / CLOUD_EVERY) + 1; i++) {
    const h = hash(i, 101)
    if (h < 0.3) continue
    const w = 0.75 + 0.45 * hash(i, 102)
    const x = view.w / 2 + (i * CLOUD_EVERY + 3 * h - lc) * s
    const y = horizon - (3.6 + 1.8 * hash(i, 103)) * s
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(s * w, s * w)
    puffs(ctx, CLOUD, C.cloud)
    roundRectPath(ctx, -0.95, -0.12, 1.85, 0.42, 0.21)
    flat(ctx, C.cloud)
    ctx.restore()
  }
  // The three layers, far to near.
  LAYERS.forEach((layer, l) => {
    const centre = layer.p * xc
    const base = ground + layer.base * s
    const down = (view.h - base) / s + 0.2
    for (let i = Math.floor((centre - half) / layer.step) - 2; i <= Math.ceil((centre + half) / layer.step) + 2; i++) {
      const h = hash(i, l + 11)
      const at = (i + 0.36 * (h - 0.5)) * layer.step
      ctx.save()
      ctx.translate(view.w / 2 + (at - centre) * s, base)
      ctx.scale(s, s)
      drawPiece(ctx, l, mixedBiome(def, at / layer.p, hash(i, l + 21)), h, down, t)
      ctx.restore()
    }
  })
  ctx.restore()
}

// ---------------------------------------------------------------------------------------
// The ground

/** The marks on a field or verge for one metre: tufts, flowers, shells, pebbles, mushrooms, paving joints. */
function fieldMarks(ctx: CanvasRenderingContext2D, def: RoadDef, m: number, biome: Biome) {
  const look = GROUND[biome]
  const gy = groundAt(def, m)
  const h = hash(m, 7)
  const h2 = hash(m, 8)
  const x = m + h * 0.8
  const y = gy + FIELD + 0.35 + h2 * 1.9
  ctx.lineCap = 'round'
  if (biome === 'dunes' || biome === 'beach') {
    // Ripples in the sand, and now and then a shell.
    ctx.beginPath()
    ctx.moveTo(x - 0.3, y)
    ctx.quadraticCurveTo(x, y - 0.07, x + 0.3, y)
    ctx.lineWidth = 0.035
    ctx.strokeStyle = look.mark
    ctx.stroke()
    if (h2 > 0.7) {
      ctx.save()
      ctx.translate(m + 0.5, gy + FIELD + 0.5 + h * 1.4)
      ctx.beginPath()
      ctx.moveTo(0, 0.05)
      ctx.arc(0, 0.05, 0.13, Math.PI * 1.15, Math.PI * 1.85)
      ctx.closePath()
      flat(ctx, ROADS.shell)
      ctx.restore()
    }
    return
  }
  if (biome === 'quarry' || biome === 'tunnel') {
    for (const k of [0, 1]) {
      const px = m + hash(m, 30 + k)
      const py = gy + FIELD + 0.3 + hash(m, 40 + k) * 2
      ctx.beginPath()
      ctx.ellipse(px, py, 0.1 + 0.06 * k, 0.06, 0, 0, TAU)
      flat(ctx, k === 0 ? look.mark : ROADS.pebble)
    }
    return
  }
  // Grass: a tuft of three blades, a flower in the meadow, a mushroom in the forest.
  ctx.beginPath()
  for (const dx of [-0.07, 0, 0.07]) {
    ctx.moveTo(x + dx * 0.5, y)
    ctx.lineTo(x + dx * 1.6, y - 0.12 + Math.abs(dx) * 0.6)
  }
  ctx.lineWidth = 0.035
  ctx.strokeStyle = look.mark
  ctx.stroke()
  if ((biome === 'meadow' || biome === 'town' || biome === 'river') && h2 > 0.45) {
    const fx = m + 0.5 + (h - 0.5) * 0.4
    const fy = gy + FIELD + 0.4 + hash(m, 9) * 1.7
    ctx.fillStyle = ROADS.flowers[Math.floor(hash(m, 10) * 4)]!
    ctx.beginPath()
    for (let k = 0; k < 5; k++) {
      const a = (k * TAU) / 5
      ctx.moveTo(fx + Math.cos(a) * 0.07 + 0.045, fy + Math.sin(a) * 0.07)
      ctx.arc(fx + Math.cos(a) * 0.07, fy + Math.sin(a) * 0.07, 0.045, 0, TAU)
    }
    ctx.fill()
    ctx.beginPath()
    ctx.arc(fx, fy, 0.04, 0, TAU)
    flat(ctx, BOX.yellow.face)
  }
  if (biome === 'forest' && h2 > 0.75) {
    const fx = m + 0.4
    const fy = gy + FIELD + 0.5 + hash(m, 9) * 1.6
    ctx.fillStyle = C.paper
    ctx.fillRect(fx - 0.035, fy - 0.12, 0.07, 0.12)
    ctx.beginPath()
    ctx.arc(fx, fy - 0.1, 0.12, Math.PI, TAU)
    ctx.closePath()
    flat(ctx, ROADS.mushroom)
    ctx.fillStyle = C.white
    ctx.beginPath()
    ctx.arc(fx - 0.05, fy - 0.15, 0.02, 0, TAU)
    ctx.arc(fx + 0.04, fy - 0.17, 0.022, 0, TAU)
    ctx.fill()
  }
}

/** The ground from x0 to x1 in world metres: the road, the kerb, the soil under it, each biome's ground, the river's bridge, the tunnel's back wall. */
export function drawRoadGround(ctx: CanvasRenderingContext2D, def: RoadDef, x0: number, x1: number, t: number): void {
  void t
  const bores = boresOf(def)
  ctx.save()
  ctx.beginPath()
  ctx.rect(x0, -1e3, x1 - x0, 2e3)
  ctx.clip()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  // Each biome's verge and field, the later one's edge in scallops over the earlier one.
  def.biomes.forEach((b, i) => {
    const a = i === 0 ? x0 : Math.max(b.from, x0 - 1)
    const e = i === def.biomes.length - 1 ? x1 : Math.min(b.to, x1 + 1)
    if (e <= a) return
    const look = GROUND[b.biome]
    band(ctx, def, a, e, VERGE, KERB_BACK + 0.02, look.verge)
    band(ctx, def, a, e, SOIL, DEEP, look.field)
    if (i > 0 && b.from >= x0 - 1 && b.from <= x1 + 1) {
      const gy = groundAt(def, b.from)
      for (let k = 0; k < 4; k++) {
        circlePath(ctx, b.from - 0.25, gy + VERGE + 0.18 + k * 0.14, 0.2 + 0.08 * hash(i, k))
        flat(ctx, look.verge)
      }
      for (let k = 0; k < 14; k++) {
        circlePath(ctx, b.from - 0.3 + 0.15 * hash(i, k + 7), gy + FIELD + k * 0.55, 0.35 + 0.15 * hash(i, k + 20))
        flat(ctx, look.field)
      }
    }
  })
  // The field's marks, metre by metre (none under the bridge or in the mountain).
  for (let m = Math.floor(x0); m <= Math.ceil(x1); m++) {
    if (within(def.bridges, m) || within(bores, m)) continue
    fieldMarks(ctx, def, m, biomeAt(def, m))
  }
  // The town's verge is paved.
  for (let m = Math.floor(x0); m <= Math.ceil(x1); m++) {
    if (biomeAt(def, m) !== 'town' || biomeAt(def, m + 1) !== 'town') continue
    const gy = groundAt(def, m)
    ctx.beginPath()
    ctx.moveTo(m, gy + VERGE)
    ctx.lineTo(m - 0.1, gy + KERB_BACK)
    ctx.lineWidth = lw('detail')
    ctx.strokeStyle = ROADS.slab
    ctx.stroke()
  }
  inkLine(ctx, def, x0, x1, VERGE, 'line')

  // The mountains the tunnels go through, over the verge and up past the chunk's top.
  for (const { from: a, to: b } of bores) {
    if (b + SHOULDER < x0 || a - SHOULDER > x1) continue
    const ya = groundAt(def, a)
    const yb = groundAt(def, b)
    ctx.beginPath()
    // Each shoulder bulges out and up from the verge to past the portal's top, then the mountain goes on up.
    ctx.moveTo(a - SHOULDER, groundAt(def, a - SHOULDER) + VERGE + 0.02)
    ctx.bezierCurveTo(a - SHOULDER * 0.8, ya + VERGE - 2.2, a - 2.4, ya + CEIL - 1.6, a - 0.6, ya + CEIL - 3.4)
    ctx.lineTo(a - 0.2, ya - 20)
    ctx.lineTo(b + 0.2, yb - 20)
    ctx.lineTo(b + 0.6, yb + CEIL - 3.4)
    ctx.bezierCurveTo(b + 2.4, yb + CEIL - 1.6, b + SHOULDER * 0.8, yb + VERGE - 2.2, b + SHOULDER, groundAt(def, b + SHOULDER) + VERGE + 0.02)
    ctx.closePath()
    part(ctx, ROADS.rock, 'line')
    // Strata, tone on tone.
    ctx.lineWidth = 0.12
    ctx.strokeStyle = ROADS.rockDark
    ctx.beginPath()
    for (let k = 0; k < 3; k++) {
      const y = ya + CEIL - 0.9 - k * 1.3
      ctx.moveTo(a - 1.2 + k * 0.4, y)
      ctx.bezierCurveTo((a + b) / 2 - 3, y - 0.4, (a + b) / 2 + 3, y + 0.4, b + 1.2 - k * 0.4, y - 0.1)
    }
    ctx.stroke()
  }

  // The road: the back kerb, the asphalt (planks on a bridge), the dashes, the zebras, the front kerb and the soil under it.
  band(ctx, def, x0, x1, KERB_BACK, TAR_BACK, ROADS.kerbTop)
  band(ctx, def, x0, x1, TAR_BACK, TAR_FRONT, ROADS.tar)
  ctx.fillStyle = C.laneDash
  for (let k = Math.floor(x0 / DASH.every); k * DASH.every < x1; k++) {
    const dx = k * DASH.every
    if (within(def.bridges, dx) || def.things.some((th) => th.kind === 'crosser' && Math.abs(th.x - dx - DASH.len / 2) < ZEBRA_W / 2 + DASH.len / 2)) continue
    strip(ctx, def, dx, dx + DASH.len, DASH.y - DASH.h / 2, DASH.y + DASH.h / 2)
    ctx.fill()
  }
  for (const th of def.things) {
    if (th.kind !== 'crosser' || th.x + ZEBRA_W < x0 || th.x - ZEBRA_W > x1) continue
    ctx.fillStyle = ROADS.zebra
    for (let k = 0; k < 4; k++) {
      const y0 = TAR_BACK + 0.05 + k * 0.2
      strip(ctx, def, th.x - ZEBRA_W / 2, th.x + ZEBRA_W / 2, y0, y0 + 0.1)
      ctx.fill()
    }
  }
  band(ctx, def, x0, x1, TAR_FRONT, KERB_FACE, ROADS.kerbTop)
  band(ctx, def, x0, x1, KERB_FACE, SOIL, ROADS.kerbFace)
  strip(ctx, def, x0, x1, SOIL, FIELD)
  flat(ctx, ROADS.soil)
  // The kerb stones' joints, and the ink along the kerbs.
  ctx.beginPath()
  for (let m = Math.floor(x0); m <= Math.ceil(x1); m++) {
    const gy = groundAt(def, m)
    ctx.moveTo(m, gy + KERB_FACE)
    ctx.lineTo(m, gy + SOIL)
  }
  ink(ctx, 'detail')
  inkLine(ctx, def, x0, x1, TAR_BACK, 'detail')
  inkLine(ctx, def, x0, x1, TAR_FRONT, 'line')
  inkLine(ctx, def, x0, x1, SOIL, 'line')

  for (const span of def.bridges) if (span.to + 1 >= x0 && span.from - 1 <= x1) drawBridge(ctx, def, span)
  for (const span of bores) if (span.to + 1 >= x0 && span.from - 1 <= x1) drawBore(ctx, def, span)
  for (const th of def.things) if (th.kind === 'surprise' && th.what === 'train' && Math.abs(th.x - (x0 + x1) / 2) < (x1 - x0) / 2 + REACH + 6) drawCrossing(ctx, def, th.x)
  ctx.restore()
}

/** A plank bridge over a river flowing across the road toward the viewer: the water and its banks, the deck, the beam along its front and the posts into the water, the rail along its back. */
function drawBridge(ctx: CanvasRenderingContext2D, def: RoadDef, { from: a, to: b }: Span) {
  const wood = MATERIAL_LOOK.planks
  const ya = groundAt(def, a)
  const yb = groundAt(def, b)
  // The river, behind the road and in front of it, between its banks.
  for (const [top, bottom] of [
    [VERGE, KERB_BACK],
    [SOIL, DEEP],
  ] as const) {
    ctx.beginPath()
    ctx.moveTo(a + 0.6, ya + top)
    ctx.lineTo(b - 0.6, yb + top)
    ctx.lineTo(b - 0.2, yb + bottom)
    ctx.lineTo(a + 0.2, ya + bottom)
    ctx.closePath()
    part(ctx, ROADS.bank, 'line')
    ctx.beginPath()
    ctx.moveTo(a + 1.0, ya + top)
    ctx.lineTo(b - 1.0, yb + top)
    ctx.lineTo(b - 0.6, yb + bottom)
    ctx.lineTo(a + 0.6, ya + bottom)
    ctx.closePath()
    part(ctx, ROADS.water, 'line')
  }
  ctx.fillStyle = ROADS.waterLight
  for (let k = 0; k < 12; k++) {
    const x = a + 1.6 + hash(Math.floor(a), k) * (b - a - 3.2)
    const y = mix(ya, yb, (x - a) / (b - a)) + SOIL + 0.5 + hash(Math.floor(a), k + 40) * 2.6
    ctx.fillRect(x, y, 0.45, 0.05)
  }
  // The posts into the water, a ripple at each.
  for (let x = a + 1.4; x < b - 1; x += 2.3) {
    const y = groundAt(def, x)
    ctx.beginPath()
    ctx.ellipse(x + 0.1, y + SOIL + 0.95, 0.26, 0.06, 0, 0, TAU)
    flat(ctx, ROADS.waterLight)
    ctx.beginPath()
    ctx.rect(x, y + SOIL - 0.05, 0.2, 1.0)
    part(ctx, wood.side, 'line')
  }
  // The deck: planks across, its back rail, its front beam.
  band(ctx, def, a, b, KERB_BACK, TAR_FRONT, wood.top)
  ctx.beginPath()
  for (let x = a + 0.3; x < b; x += 0.36) {
    const y = groundAt(def, x)
    ctx.moveTo(x, y + KERB_BACK)
    ctx.lineTo(x, y + TAR_FRONT)
  }
  ctx.lineWidth = lw('detail')
  ctx.strokeStyle = wood.mark
  ctx.stroke()
  for (let x = a + 0.2; x <= b; x += 1.6) {
    const y = groundAt(def, x) + KERB_BACK
    ctx.beginPath()
    ctx.rect(x - 0.06, y - 0.62, 0.12, 0.64)
    part(ctx, wood.face, 'detail')
  }
  ctx.beginPath()
  along(ctx, def, a, b, KERB_BACK - 0.58, true)
  ctx.lineCap = 'round'
  tube(ctx, 0.08, wood.face)
  strip(ctx, def, a, b, TAR_FRONT, SOIL + 0.06)
  part(ctx, wood.face, 'line')
  ctx.beginPath()
  for (let x = a + 0.15; x < b; x += 0.6) {
    const y = groundAt(def, x) + (TAR_FRONT + SOIL) / 2 + 0.03
    ctx.moveTo(x + 0.04, y)
    ctx.arc(x, y, 0.016, 0, TAU)
  }
  ctx.fillStyle = wood.mark
  ctx.fill()
  inkLine(ctx, def, a, b, KERB_BACK, 'detail')
}

/** The vault's opening from the floor at a, up and round its corner, along the ceiling (following the road) and down at b; `up` false runs it the other way, from b's floor. It continues the current path. */
function vault(ctx: CanvasRenderingContext2D, def: RoadDef, a: number, b: number, up: boolean) {
  const r = VAULT_R
  const ga = groundAt(def, a)
  const gb = groundAt(def, b)
  if (up) {
    ctx.lineTo(a, ga + CEIL + r)
    ctx.arcTo(a, ga + CEIL, a + r, ga + CEIL, r)
    along(ctx, def, a + r, b - r, CEIL, false)
    ctx.arcTo(b, gb + CEIL, b, gb + CEIL + r, r)
  } else {
    ctx.lineTo(b, gb + CEIL + r)
    ctx.arcTo(b, gb + CEIL, b - r, gb + CEIL, r)
    along(ctx, def, b - r, a + r, CEIL, false)
    ctx.arcTo(a, ga + CEIL, a, ga + CEIL + r, r)
  }
}

/** A cluster of three crystals standing on (x, y), `k` times its size: the gem peeking out of a cracked boulder, a real one the truck takes. */
function crystals(ctx: CanvasRenderingContext2D, x: number, y: number, k: number) {
  for (const [dx, h, tone] of CRYSTAL_SET) {
    ctx.beginPath()
    ctx.moveTo(x + (dx - 0.05) * k, y)
    ctx.lineTo(x + (dx - 0.05) * k, y - h * 0.7 * k)
    ctx.lineTo(x + dx * k, y - h * k)
    ctx.lineTo(x + (dx + 0.05) * k, y - h * 0.7 * k)
    ctx.lineTo(x + (dx + 0.05) * k, y)
    ctx.closePath()
    part(ctx, RAW_LOOK.gem[tone], 'detail')
  }
}
/** The crystals of a cluster: [x, height, tone], the far small ones first. */
const CRYSTAL_SET = [
  [-0.085, 0.2, 'dark'],
  [0.085, 0.17, 'light'],
  [0, 0.28, 'body'],
] as const

/** A stone set in the rock: its outline (x, y pairs) in units of its size, and the lit strip along its top edge (the outline's first points). */
const STONE = [-0.3, 0.02, -0.24, -0.12, -0.04, -0.18, 0.2, -0.14, 0.32, -0.02, 0.26, 0.12, 0.02, 0.16, -0.22, 0.12] as const
const STONE_TOP = 4

/**
 * Two flat stones set in the rock at (x, y), `k` times their size, the second smaller and
 * turned by a: each filled flat a tone lighter than the rock, a lighter strip along its top,
 * no ink. They are part of the wall like the courses round them, wide, dull and lying,
 * where a gem is small, upright, bright, inked and twinkling, so nothing in the tunnel
 * looks like a gem to collect but the gems on the road.
 */
function stones(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, a: number, body: string, top: string) {
  for (const [dx, dy, size, turn] of [
    [0, 0, k, a],
    [0.5 * k, 0.12 * k, 0.55 * k, -a - 0.5],
  ] as const) {
    ctx.save()
    ctx.translate(x + dx, y + dy)
    ctx.rotate(turn)
    ctx.scale(size, size)
    ctx.beginPath()
    for (let i = 0; i < STONE.length; i += 2) ctx.lineTo(STONE[i]!, STONE[i + 1]!)
    ctx.closePath()
    flat(ctx, body)
    ctx.beginPath()
    for (let i = 0; i < 2 * STONE_TOP; i += 2) ctx.lineTo(STONE[i]!, STONE[i + 1]! + 0.035)
    ctx.lineWidth = 0.05
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = top
    ctx.stroke()
    ctx.restore()
  }
}

/** A tunnel bore through the mountain, seen cut open: the warm back wall with its lamps and the stones set in it under the vaulted ceiling, and the cut rock in front of the road. */
function drawBore(ctx: CanvasRenderingContext2D, def: RoadDef, { from: a, to: b }: Span) {
  ctx.beginPath()
  ctx.moveTo(a, groundAt(def, a) + KERB_BACK + 0.02)
  vault(ctx, def, a, b, true)
  ctx.lineTo(b, groundAt(def, b) + KERB_BACK + 0.02)
  along(ctx, def, b, a, KERB_BACK + 0.02, false)
  ctx.closePath()
  part(ctx, ROADS.wall, 'line')
  ctx.save()
  ctx.clip()
  // Courses of stone in the wall, tone on tone.
  ctx.lineWidth = 0.07
  ctx.strokeStyle = ROADS.wallDark
  ctx.beginPath()
  for (let k = 0; k < 4; k++) along(ctx, def, a, b, KERB_BACK - 0.5 - k * 0.6, true)
  ctx.stroke()
  // Warm lamps along the wall, each in its pool of light.
  for (let x = a + 2.2; x < b - 1; x += LAMP_EVERY) {
    const y = groundAt(def, x) + CEIL + 0.7
    circlePath(ctx, x, y + 0.1, 0.75)
    flat(ctx, C.light)
    ctx.beginPath()
    ctx.moveTo(x, y - 0.32)
    ctx.lineTo(x, y - 0.08)
    ink(ctx, 'line')
    circlePath(ctx, x, y + 0.06, 0.1)
    part(ctx, ROADS.lamp, 'detail')
    ctx.beginPath()
    ctx.arc(x, y + 0.02, 0.15, Math.PI, TAU)
    ctx.closePath()
    part(ctx, BOX.steel.side, 'detail')
  }
  // Stones set in the wall, between the lamps.
  for (let x = a + 2.2 + LAMP_EVERY / 2; x < b - 1; x += LAMP_EVERY) {
    const h = hash(Math.floor(x), 3)
    stones(ctx, x, groundAt(def, x) + KERB_BACK - 0.75 - h * 0.9, 1.4, (h - 0.5) * 0.6, ROADS.stone, ROADS.stoneTop)
  }
  ctx.restore()
  // The rock cut open in front of the road, with stones in it.
  strip(ctx, def, a, b, FIELD, DEEP)
  part(ctx, ROADS.cut, 'line')
  ctx.lineWidth = 0.1
  ctx.strokeStyle = ROADS.cutDark
  ctx.beginPath()
  for (let k = 0; k < 4; k++) along(ctx, def, a + 0.3, b - 0.3, FIELD + 0.45 + k * 0.62, true)
  ctx.stroke()
  for (let k = 0; k < 4; k++) {
    const x = a + 1.5 + ((k + hash(Math.floor(b), k)) * (b - a - 3)) / 4
    const h = hash(Math.floor(b), k + 5)
    stones(ctx, x, groundAt(def, x) + FIELD + 0.65 + h * 1.6, 1.2, (0.5 - h) * 0.6, ROADS.cutStone, ROADS.cutStoneTop)
  }
}

/** The level crossing at x: the track across the road and the verges, the crossbuck behind and the barrier's post in front (its arm and lamp, and the bush the train comes out of, are the train's, drawSurprise). */
function drawCrossing(ctx: CanvasRenderingContext2D, def: RoadDef, x: number) {
  const gy = groundAt(def, x)
  const y0 = gy + DASH.y
  const at = (sAlong: number, across: number): [number, number] => [x + sAlong * TRACK.cos - across * TRACK.sin, y0 + sAlong * TRACK.sin + across * TRACK.cos]
  const s0 = RAILS.from
  const s1 = RAILS.to
  // Ballast and sleepers on the verges, a smooth panel on the road.
  const quad = (sa: number, sb: number, w: number, colour: string) => {
    const p = [at(sa, -w), at(sb, -w), at(sb, w), at(sa, w)]
    ctx.beginPath()
    p.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)))
    ctx.closePath()
    flat(ctx, colour)
  }
  const roadBack = (KERB_BACK - DASH.y) / TRACK.sin
  const roadFront = (SOIL - DASH.y) / TRACK.sin
  quad(s0, roadBack, TRACK.ballast, ROADS.ballast)
  quad(roadFront, s1, TRACK.ballast, ROADS.ballast)
  for (let sAlong = s0 + 0.15; sAlong < s1; sAlong += 0.42) {
    if (sAlong > roadBack - 0.1 && sAlong < roadFront + 0.1) continue
    quad(sAlong, sAlong + 0.16, 0.38, ROADS.sleeper)
  }
  quad(roadBack, roadFront, 0.36, ROADS.kerbFace)
  ctx.beginPath()
  for (const side of [-1, 1]) {
    const [ax, ay] = at(s0, side * TRACK.gauge)
    const [bx, by] = at(s1, side * TRACK.gauge)
    ctx.moveTo(ax, ay)
    ctx.lineTo(bx, by)
  }
  ctx.lineCap = 'butt'
  tube(ctx, 0.05, ROADS.rail)
  // The crossbuck on the back verge.
  const cx = x + CROSSBUCK.x
  const cy = gy + CROSSBUCK.y
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx, cy - CROSSBUCK.h)
  ctx.lineCap = 'round'
  tube(ctx, 0.07, BOX.steel.top)
  for (const a of [-0.6, 0.6]) {
    ctx.save()
    ctx.translate(cx, cy - CROSSBUCK.h + 0.05)
    ctx.rotate(a)
    roundRectPath(ctx, -0.36, -0.055, 0.72, 0.11, 0.03)
    part(ctx, C.white, 'detail')
    roundRectPath(ctx, -0.3, -0.025, 0.6, 0.05, 0.02)
    flat(ctx, ROADS.crossbuck)
    ctx.restore()
  }
  // The barrier's post in front, with its lamp housing.
  const bx = x + BARRIER.x
  const by = gy + BARRIER.y
  ctx.save()
  ctx.translate(bx, by)
  groundShadow(ctx, 0.44)
  ctx.restore()
  roundRectPath(ctx, bx - 0.07, by - BARRIER.h - 0.35, 0.14, BARRIER.h + 0.35, 0.04)
  part(ctx, C.white, 'line')
  ctx.fillStyle = ROADS.barrier
  for (let k = 0; k < 3; k++) ctx.fillRect(bx - 0.065, by - 0.25 - k * 0.32, 0.13, 0.14)
  circlePath(ctx, bx, by - BARRIER.h - 0.42, 0.13)
  part(ctx, ROADS.lampOff, 'line')
}

// ---------------------------------------------------------------------------------------
// What stands in front of the truck

/** What stands in front of the truck from x0 to x1: grass tufts, the bridge's near rail, the tunnel's front arch. */
export function drawRoadFront(ctx: CanvasRenderingContext2D, def: RoadDef, x0: number, x1: number, t: number): void {
  const bores = boresOf(def)
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  // Tufts along the front of the road, swaying a little; beach grass on the sand, pebbles in the quarry.
  for (let m = Math.floor(x0 / 1.7); m * 1.7 <= x1; m++) {
    const x = m * 1.7 + hash(m, 51) * 0.9
    if (within(def.bridges, x) || within(bores, x) || def.things.some((th) => th.kind === 'surprise' && th.what === 'train' && x > th.x - 1 && x < th.x + 9)) continue
    const biome = biomeAt(def, x)
    const y = groundAt(def, x) + FIELD + 0.06
    const sway = 0.06 * Math.sin(TAU * (t / 2.4 + hash(m, 52)))
    if (biome === 'quarry' || biome === 'tunnel') {
      // A little faceted stone with its lit top.
      ctx.beginPath()
      ctx.moveTo(x - 0.15, y + 0.02)
      ctx.lineTo(x - 0.13, y - 0.08)
      ctx.lineTo(x - 0.03, y - 0.14)
      ctx.lineTo(x + 0.1, y - 0.1)
      ctx.lineTo(x + 0.15, y + 0.02)
      ctx.closePath()
      part(ctx, RAW_LOOK.rock.body, 'detail')
      ctx.beginPath()
      ctx.moveTo(x - 0.13, y - 0.08)
      ctx.lineTo(x - 0.03, y - 0.14)
      ctx.lineTo(x + 0.1, y - 0.1)
      ctx.lineTo(x - 0.02, y - 0.06)
      ctx.closePath()
      flat(ctx, RAW_LOOK.rock.light)
      continue
    }
    const tall = biome === 'dunes' || biome === 'beach' ? 0.42 : 0.26
    const colour = biome === 'dunes' || biome === 'beach' ? BACK.dryGrass : biome === 'forest' ? GROUND.forest.verge : BOX.grass.top
    ctx.beginPath()
    ctx.moveTo(x - 0.16, y)
    ctx.quadraticCurveTo(x - 0.14, y - tall * 0.5, x - 0.2 + sway, y - tall * 0.8)
    ctx.quadraticCurveTo(x - 0.06, y - tall * 0.5, x - 0.04, y - 0.06)
    ctx.quadraticCurveTo(x - 0.02, y - tall * 0.6, x + sway, y - tall)
    ctx.quadraticCurveTo(x + 0.06, y - tall * 0.6, x + 0.05, y - 0.06)
    ctx.quadraticCurveTo(x + 0.1, y - tall * 0.5, x + 0.2 + sway, y - tall * 0.75)
    ctx.quadraticCurveTo(x + 0.16, y - tall * 0.4, x + 0.16, y)
    ctx.closePath()
    part(ctx, colour, 'detail')
  }
  // The bridge's near rail.
  const wood = MATERIAL_LOOK.planks
  for (const { from: a, to: b } of def.bridges) {
    if (b < x0 || a > x1) continue
    for (let x = a + 0.2; x <= b; x += 1.6) {
      const y = groundAt(def, x) + SOIL
      roundRectPath(ctx, x - 0.07, y - RAIL_H - 0.04, 0.14, RAIL_H + 0.1, 0.03)
      part(ctx, wood.face, 'line')
    }
    ctx.beginPath()
    along(ctx, def, a, b, SOIL - RAIL_H, true)
    tube(ctx, 0.09, wood.top)
  }
  // Each tunnel's front arch: the stone portals at both ends, the rim along the top, all following the road.
  const stone = ROADS.portal
  for (const { from: a, to: b } of bores) {
    if (b + 1.5 < x0 || a - 1.5 > x1) continue
    const ga = groundAt(def, a)
    const gb = groundAt(def, b)
    const r = VAULT_R
    ctx.beginPath()
    ctx.moveTo(a - PORTAL_W, groundAt(def, a - PORTAL_W) + FIELD)
    along(ctx, def, a - PORTAL_W, b + PORTAL_W, CEIL - RIM_H, false)
    ctx.lineTo(b + PORTAL_W, groundAt(def, b + PORTAL_W) + FIELD)
    ctx.lineTo(b, gb + FIELD)
    vault(ctx, def, a, b, false)
    ctx.lineTo(a, ga + FIELD)
    ctx.closePath()
    part(ctx, stone.face, 'edge')
    // The joints: courses up the portals, stones along the rim, voussoirs round the corners.
    ctx.beginPath()
    for (const [x, g] of [
      [a - PORTAL_W, ga],
      [b, gb],
    ] as const) {
      for (let k = 0; k < 3; k++) {
        const y = g + FIELD - 0.95 - k * 0.95
        ctx.moveTo(x, y)
        ctx.lineTo(x + PORTAL_W, y)
      }
    }
    for (let x = a + r + 0.6; x < b - r - 0.3; x += 1.3) {
      const g = groundAt(def, x)
      ctx.moveTo(x, g + CEIL)
      ctx.lineTo(x, g + CEIL - RIM_H)
    }
    // The ring of arch stones round each corner of the opening, and its outer edge.
    const ring = RIM_H * 0.55
    for (const [cx, cy, from] of [
      [a + r, ga + CEIL + r, Math.PI],
      [b - r, gb + CEIL + r, Math.PI * 1.5],
    ] as const) {
      for (let k = 1; k < 5; k++) {
        const ang = from + (k * Math.PI) / 10
        ctx.moveTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r)
        ctx.lineTo(cx + Math.cos(ang) * (r + ring), cy + Math.sin(ang) * (r + ring))
      }
      ctx.moveTo(cx + Math.cos(from) * (r + ring), cy + Math.sin(from) * (r + ring))
      ctx.arc(cx, cy, r + ring, from, from + Math.PI / 2)
    }
    // The ring runs on down both jambs and along the top.
    ctx.moveTo(a - ring, ga + CEIL + r)
    ctx.lineTo(a - ring, ga + FIELD)
    ctx.moveTo(b + ring, gb + CEIL + r)
    ctx.lineTo(b + ring, gb + FIELD)
    along(ctx, def, a + r, b - r, CEIL - ring, true)
    ink(ctx, 'detail')
    // The lit top of the rim.
    const d = 0.16
    ctx.beginPath()
    along(ctx, def, a - PORTAL_W, b + PORTAL_W, CEIL - RIM_H, true)
    ctx.lineTo(b + PORTAL_W + d, gb + CEIL - RIM_H - d)
    along(ctx, def, b + PORTAL_W, a - PORTAL_W, CEIL - RIM_H - d, false)
    ctx.closePath()
    part(ctx, stone.top, 'line')
  }
  ctx.restore()
}

// ---------------------------------------------------------------------------------------
// The things on the road

/** A pickup bobs this high every BOB_FOR seconds and twinkles every TWINKLE_EVERY. */
const BOB = 0.05
const BOB_FOR = 1.8
const TWINKLE_EVERY = 2.6

/** A raw good lying on the road, bobbing and twinkling a little; origin on the ground under it. */
export function drawPickup(ctx: CanvasRenderingContext2D, good: Raw, t: number, phase: number): void {
  const bob = BOB * (0.5 - 0.5 * Math.cos(TAU * loop(t, BOB_FOR, phase)))
  ctx.save()
  groundShadow(ctx, 0.46 - bob * 1.6)
  circlePath(ctx, 0, -0.27 - bob, 0.36)
  flat(ctx, C.light)
  ctx.translate(0, -0.04 - bob)
  drawGood(ctx, good, t + phase * 3)
  const tw = loop(t, TWINKLE_EVERY, phase * 1.7)
  if (tw < 0.22) sparkle(ctx, 0.24, -0.5, 0.16 * arch(tw / 0.22), C.sparkle)
  ctx.restore()
}

/** The boulder's cracks, in its own units (x from -1 to 1 across, y from 0 at its foot to -1 at its top): they open from where the tool lands, on its left, and spread across it. */
const CRACKS: readonly (readonly number[])[] = [
  [-0.97, -0.52, -0.66, -0.47, -0.5, -0.6, -0.22, -0.55],
  [-0.5, -0.6, -0.46, -0.76, -0.24, -0.88],
  [-0.66, -0.47, -0.6, -0.32, -0.38, -0.24, -0.34, -0.08],
  [-0.22, -0.55, 0.04, -0.6, 0.2, -0.47, 0.46, -0.52],
  [0.04, -0.6, 0.1, -0.79, 0.32, -0.93],
  [0.2, -0.47, 0.3, -0.3, 0.56, -0.22, 0.78, -0.3],
]
/** Where each hit lands, in the same units: the tool's marks go here, one per hit so far. */
const HITS: readonly (readonly [number, number])[] = [
  [-0.78, -0.55],
  [-0.68, -0.7],
  [-0.84, -0.38],
  [-0.56, -0.84],
  [-0.62, -0.26],
]
/** A hit shakes the boulder for SHAKE_FOR seconds; the newest crack grows over CRACK_GROW. */
const SHAKE_FOR = 0.35
const CRACK_GROW = 0.14

/** The boulder's lumps reach 7.5% past its round outline, so the outline is this much of its size either way and the lumps stay in its w by h. */
const LUMP = 0.465
/** The boulder's outline through its lumps: a fresh path, w by h standing on its flat foot. */
function boulderPath(ctx: CanvasRenderingContext2D, w: number, h: number, big: boolean) {
  const n = 20
  const pts: [number, number][] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU
    const r = 1 + 0.045 * Math.sin(3 * a + (big ? 1.3 : 0.4)) + 0.03 * Math.sin(5 * a + 2.1)
    pts.push([Math.cos(a) * r * w * LUMP, Math.min(0, -h * 0.5 + Math.sin(a) * r * h * LUMP)])
  }
  ctx.beginPath()
  const mid = (i: number): [number, number] => {
    const p = pts[i % n]!
    const q = pts[(i + 1) % n]!
    return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]
  }
  const m0 = mid(0)
  ctx.moveTo(m0[0], m0[1])
  for (let i = 1; i <= n; i++) {
    const p = pts[i % n]!
    const m = mid(i)
    ctx.quadraticCurveTo(p[0], p[1], m[0], m[1])
  }
  ctx.closePath()
}

/** A boulder with `hits` cracks so far, the last hit `hitAge` seconds ago by `tool` (each tool leaves its own mark); origin at its foot. */
export function drawBoulder(ctx: CanvasRenderingContext2D, size: 'small' | 'big', gem: boolean, hits: number, hitAge: number, tool: Tool, t: number): void {
  const big = size === 'big'
  const w = big ? 1.6 : 1.2
  const h = big ? 1.8 : 1.3
  const most = BOULDER_HITS[size]
  const age = Math.min(Math.max(hitAge, 0), 10)
  const rock = RAW_LOOK.rock
  const fine = detail(h) !== 'S'
  const at = (u: number, v: number): [number, number] => [u * w * 0.5, v * h]
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  groundShadow(ctx, w * 1.04)
  // A hit shakes it about its foot; with one hit to go it teeters.
  const shake = age < SHAKE_FOR ? 0.05 * Math.sin(TAU * 7 * age) * (1 - age / SHAKE_FOR) : 0
  const teeter = hits === most - 1 && hits > 0 ? 0.022 * Math.sin(TAU * loop(t, 0.9, 0)) : 0
  const [sx, sy] = squash(age)
  ctx.rotate(shake + teeter)
  ctx.scale(sx, sy)
  // Grass at its foot.
  for (const s of [-1, 1]) {
    ctx.beginPath()
    const gx = s * w * 0.44
    ctx.moveTo(gx - 0.1, 0.02)
    ctx.quadraticCurveTo(gx - 0.1, -0.12, gx - 0.14, -0.2)
    ctx.quadraticCurveTo(gx - 0.02, -0.12, gx, -0.26)
    ctx.quadraticCurveTo(gx + 0.04, -0.12, gx + 0.14, -0.18)
    ctx.quadraticCurveTo(gx + 0.1, -0.08, gx + 0.1, 0.02)
    ctx.closePath()
    part(ctx, BOX.grass.face, 'detail')
  }
  // The body: the lit top facet and the dark right side inside its outline.
  boulderPath(ctx, w, h, big)
  ctx.fillStyle = rock.body
  ctx.fill()
  ctx.save()
  boulderPath(ctx, w, h, big)
  ctx.clip()
  ctx.beginPath()
  ctx.moveTo(w * 0.12, -h)
  ctx.bezierCurveTo(w * 0.34, -h * 0.72, w * 0.18, -h * 0.3, w * 0.26, 0)
  ctx.lineTo(w * 0.55, 0)
  ctx.lineTo(w * 0.55, -h)
  ctx.closePath()
  part(ctx, rock.dark, 'detail')
  ctx.beginPath()
  ctx.moveTo(-w * 0.6, -h * 0.66)
  ctx.bezierCurveTo(-w * 0.3, -h * 0.78, -w * 0.02, -h * 0.74, w * 0.2, -h * 0.84)
  ctx.lineTo(w * 0.2, -h)
  ctx.lineTo(-w * 0.55, -h)
  ctx.closePath()
  part(ctx, rock.light, 'detail')
  if (fine) {
    for (const [u, v, r] of [
      [-0.5, -0.3, 0.04],
      [-0.2, -0.18, 0.03],
      [0.1, -0.42, 0.035],
      [-0.35, -0.5, 0.025],
    ] as const) {
      circlePath(ctx, u * w * 0.5, v * h, r)
      flat(ctx, rock.light)
    }
  }
  // A moss cap with a little flower.
  blob(ctx, [-w * 0.2, -h * 0.92, w * 0.1, -w * 0.05, -h * 0.95, w * 0.11, w * 0.09, -h * 0.92, w * 0.08], BOX.grass.top, 'detail')
  ctx.restore()
  boulderPath(ctx, w, h, big)
  ink(ctx, 'edge')
  // The flower grows on its left shoulder, low enough to stay inside the stop strip's picture.
  const fx = -w * 0.24
  const fy = -h * 0.88
  ctx.beginPath()
  ctx.moveTo(fx, fy)
  ctx.lineTo(fx, fy - 0.12)
  ink(ctx, 'detail')
  for (let k = 0; k < 4; k++) {
    circlePath(ctx, fx + Math.cos((k * TAU) / 4) * 0.035, fy - 0.14 + Math.sin((k * TAU) / 4) * 0.035, 0.03)
    part(ctx, C.white, 'detail')
  }
  circlePath(ctx, fx, fy - 0.14, 0.022)
  flat(ctx, BOX.yellow.face)

  // The tool's marks, one per hit.
  for (let k = 0; k < Math.min(hits, HITS.length); k++) {
    const [px, py] = at(HITS[k]![0], HITS[k]![1])
    toolMark(ctx, tool, px, py, t + k * 0.37)
  }
  // The cracks so far, the newest growing in; a hidden gem peeks through them.
  const shown = Math.round((CRACKS.length * hits) / most)
  const before = Math.round((CRACKS.length * (hits - 1)) / most)
  const grow = smooth(0, CRACK_GROW, age)
  if (gem && hits > 0) {
    const [gx, gy] = at(-0.22, -0.55)
    const k = 0.6 + 0.4 * (hits / most)
    ctx.beginPath()
    ctx.moveTo(gx - 0.13 * k, gy)
    ctx.lineTo(gx, gy - 0.1 * k)
    ctx.lineTo(gx + 0.13 * k, gy)
    ctx.lineTo(gx, gy + 0.1 * k)
    ctx.closePath()
    ctx.fillStyle = INK
    ctx.fill()
    crystals(ctx, gx, gy + 0.03, 0.62 * k)
    sparkle(ctx, gx + 0.14, gy - 0.16 * k, 0.05 + 0.1 * arch(loop(t, 1.4, 0.2)), C.sparkle)
  }
  for (let c = 0; c < shown; c++) {
    const pts = CRACKS[c]!
    const k = c >= before ? grow : 1
    ctx.beginPath()
    const n = pts.length / 2
    const end = 1 + (n - 1) * k
    for (let i = 0; i < n && i < end; i++) {
      const f = Math.min(1, end - i)
      const [x, y] = at(pts[i * 2]!, pts[i * 2 + 1]!)
      if (i === 0) ctx.moveTo(x, y)
      else {
        const [px, py] = at(pts[i * 2 - 2]!, pts[i * 2 - 1]!)
        ctx.lineTo(mix(px, x, f), mix(py, y, f))
      }
    }
    ink(ctx, 'line')
  }
  ctx.restore()
}

/** One hit's mark at (x, y): the hammer's dent, the pickaxe's chip, the drill's hole, the shovel's scoop, the wrench's twist, the wand's sparkle. */
function toolMark(ctx: CanvasRenderingContext2D, tool: Tool, x: number, y: number, t: number) {
  const rock = RAW_LOOK.rock
  switch (tool) {
    case 'hammer':
      circlePath(ctx, x, y, 0.065)
      flat(ctx, rock.dark)
      ctx.beginPath()
      ctx.arc(x, y, 0.065, 0.1, 1.6)
      ctx.lineWidth = lw('detail')
      ctx.strokeStyle = rock.light
      ctx.stroke()
      return
    case 'pickaxe':
      ctx.beginPath()
      ctx.moveTo(x - 0.08, y - 0.05)
      ctx.lineTo(x + 0.07, y - 0.08)
      ctx.lineTo(x + 0.02, y + 0.07)
      ctx.closePath()
      part(ctx, rock.light, 'detail')
      return
    case 'drill':
      circlePath(ctx, x, y, 0.07)
      flat(ctx, rock.dark)
      circlePath(ctx, x, y, 0.04)
      flat(ctx, INK)
      return
    case 'shovel':
      ctx.beginPath()
      ctx.arc(x, y - 0.05, 0.09, 0.3, Math.PI - 0.3)
      ctx.lineWidth = Math.max(lw('line'), 0.03)
      ctx.strokeStyle = rock.dark
      ctx.stroke()
      return
    case 'wrench':
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(0.5)
      ctx.fillStyle = rock.dark
      ctx.fillRect(-0.08, -0.05, 0.16, 0.035)
      ctx.fillRect(-0.08, 0.015, 0.16, 0.035)
      ctx.restore()
      return
    case 'wand':
      sparkle(ctx, x, y, 0.13 + 0.05 * Math.sin(TAU * (t / 1.1)), C.sparkleWarm)
      return
  }
}

// ---------------------------------------------------------------------------------------
// The crossers

/** One animal of a family. */
type Beast = 'duck' | 'duckling' | 'cat' | 'kitten' | 'greyKitten' | 'hedgehog' | 'hoglet' | 'cow' | 'calf'
/** Each family in the order they walk, each animal this far (along the path) behind the one before; where the leader waits; and how much bigger than life the family is drawn, so the small ones read at the road's scale. */
const FAMILIES: Record<Crosser, { start: number; size: number; members: readonly { beast: Beast; gap: number }[] }> = {
  ducks: {
    start: -0.15,
    size: 1.3,
    members: [
      { beast: 'duck', gap: 0 },
      { beast: 'duckling', gap: 0.38 },
      { beast: 'duckling', gap: 0.23 },
      { beast: 'duckling', gap: 0.23 },
      { beast: 'duckling', gap: 0.23 },
    ],
  },
  cats: {
    start: -0.1,
    size: 1.15,
    members: [
      { beast: 'cat', gap: 0 },
      { beast: 'kitten', gap: 0.55 },
      { beast: 'greyKitten', gap: 0.4 },
    ],
  },
  hedgehogs: {
    start: -0.1,
    size: 1.3,
    members: [
      { beast: 'hedgehog', gap: 0 },
      { beast: 'hoglet', gap: 0.42 },
      { beast: 'hoglet', gap: 0.32 },
    ],
  },
  cows: {
    start: -0.25,
    size: 1,
    members: [
      { beast: 'cow', gap: 0 },
      { beast: 'calf', gap: 0.96 },
    ],
  },
}
/** The crossing's path: the leader walks CROSS_LEN metres from its start down toward the viewer, a little to the left; the rest wait in a queue behind it, up the road to the right. */
const CROSS_LEN = 4.8
const CROSS_DIR = (() => {
  const l = Math.hypot(-0.24, 1)
  return [-0.24 / l, 1 / l] as const
})()
const QUEUE_DIR = (() => {
  const l = Math.hypot(1, -0.45)
  return [1 / l, -0.45 / l] as const
})()
/** Answering the horn: each animal in turn, WAVE_EVERY apart, hops and waves for WAVE_FOR. */
const WAVE_FOR = 1.4
const WAVE_EVERY = 0.12

/** A figure's two passes, as the builder's: the backing strokes every part wide in ink first, so the silhouette reads at the edge weight. */
interface Pen {
  ctx: CanvasRenderingContext2D
  back: boolean
}
function fill(p: Pen, colour: string) {
  if (p.back) {
    p.ctx.lineWidth = 2 * lw('edge') - lw('line')
    p.ctx.strokeStyle = INK
    p.ctx.stroke()
  } else part(p.ctx, colour, 'line')
}
function limb(p: Pen, w: number, colour: string) {
  if (p.back) {
    p.ctx.lineWidth = w + 2 * lw('edge')
    p.ctx.strokeStyle = INK
    p.ctx.stroke()
  } else tube(p.ctx, w, colour)
}
/** Draws a figure in its two passes (one when small on screen). */
function figure(ctx: CanvasRenderingContext2D, heightM: number, draw: (p: Pen) => void) {
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (detail(heightM) !== 'S') draw({ ctx, back: true })
  draw({ ctx, back: false })
  ctx.restore()
}

/** An animal's moment: its walk's phase (0 to 1 a stride, or -1 standing), how far it waves (0 to 1) and the waggle of the wave, the time for blinks. */
interface Moment {
  step: number
  wave: number
  waggle: number
  t: number
}
const legSwing = (m: Moment, k: number) => (m.step < 0 ? 0 : Math.sin(TAU * (m.step + k)))
const faceMood = (m: Moment, phase: number) => (m.wave > 0.05 ? 'happy' : loop(m.t, 3.3, phase) > 0.96 ? 'closed' : 'open')

/** The mother duck, white with an orange beak, holding up her little round stop sign in front of her; facing right, feet at the origin. */
function drawDuck(p: Pen, m: Moment) {
  const ctx = p.ctx
  for (const k of [0.5, 0]) {
    const lift = Math.max(0, legSwing(m, k)) * 0.04
    ctx.beginPath()
    ctx.ellipse(k === 0 ? 0.05 : -0.03, -0.015 - lift, 0.07, 0.03, 0, 0, TAU)
    fill(p, COAT.beak)
  }
  // A plump body with a perky tail, the neck and the round head.
  ctx.beginPath()
  ctx.moveTo(-0.24, -0.3)
  ctx.quadraticCurveTo(-0.24, -0.03, -0.02, -0.03)
  ctx.quadraticCurveTo(0.18, -0.03, 0.17, -0.15)
  ctx.quadraticCurveTo(0.15, -0.23, 0.04, -0.22)
  ctx.quadraticCurveTo(-0.1, -0.21, -0.24, -0.3)
  ctx.closePath()
  fill(p, COAT.duck)
  blobPen(p, [0.07, -0.25, 0.065, 0.1, -0.35, 0.095], COAT.duck)
  ctx.beginPath()
  ctx.moveTo(0.17, -0.37)
  ctx.quadraticCurveTo(0.27, -0.38, 0.28, -0.34)
  ctx.quadraticCurveTo(0.27, -0.31, 0.17, -0.32)
  ctx.closePath()
  fill(p, COAT.beak)
  // The sign: a red disc with a white rim and bar on a stick held up in front of her; it waggles when she waves.
  ctx.save()
  ctx.translate(0.24, -0.15)
  ctx.rotate(0.12 + 0.3 * m.wave * Math.sin(TAU * m.waggle))
  ctx.beginPath()
  ctx.moveTo(0, 0.04)
  ctx.lineTo(0.05, -0.42)
  limb(p, 0.028, COAT.signStick)
  circlePath(ctx, 0.06, -0.5, 0.11)
  fill(p, C.white)
  if (!p.back) {
    circlePath(ctx, 0.06, -0.5, 0.085)
    flat(ctx, COAT.sign)
    ctx.fillStyle = C.white
    ctx.fillRect(0.06 - 0.055, -0.52, 0.11, 0.04)
  }
  ctx.restore()
  // The wing reaching forward to hold the stick.
  ctx.beginPath()
  ctx.moveTo(-0.12, -0.17)
  ctx.quadraticCurveTo(-0.02, -0.24, 0.12, -0.17)
  ctx.quadraticCurveTo(0.24, -0.13, 0.25, -0.12)
  ctx.quadraticCurveTo(0.12, -0.07, -0.02, -0.09)
  ctx.quadraticCurveTo(-0.1, -0.1, -0.12, -0.17)
  ctx.closePath()
  fill(p, COAT.duckShade)
  if (p.back) return
  eyes(ctx, 0.13, -0.37, 0.036, 0.055, faceMood(m, 0.1), COAT.duck)
  blush(ctx, 0.12, -0.32, 0.024)
}
/** A duckling, a yellow puff with a tuft; facing right, feet at the origin. */
function drawDuckling(p: Pen, m: Moment) {
  const ctx = p.ctx
  for (const k of [0.5, 0]) {
    const lift = Math.max(0, legSwing(m, k)) * 0.03
    ctx.beginPath()
    ctx.ellipse(k === 0 ? 0.03 : -0.03, -0.01 - lift, 0.04, 0.018, 0, 0, TAU)
    fill(p, COAT.beak)
  }
  blobPen(p, [-0.02, -0.085, 0.078, 0.06, -0.17, 0.062], COAT.duckling)
  ctx.beginPath()
  ctx.moveTo(0.11, -0.18)
  ctx.quadraticCurveTo(0.17, -0.18, 0.17, -0.165)
  ctx.quadraticCurveTo(0.16, -0.15, 0.11, -0.155)
  ctx.closePath()
  fill(p, COAT.beak)
  ctx.save()
  ctx.translate(-0.03, -0.09)
  ctx.rotate(-1.2 * m.wave * (0.6 + 0.4 * Math.sin(TAU * m.waggle)))
  ctx.beginPath()
  ctx.ellipse(-0.015, 0, 0.042, 0.026, -0.3, 0, TAU)
  fill(p, COAT.ducklingShade)
  ctx.restore()
  if (p.back) return
  ctx.beginPath()
  ctx.moveTo(0.05, -0.225)
  ctx.lineTo(0.04, -0.26)
  ctx.moveTo(0.065, -0.228)
  ctx.lineTo(0.078, -0.26)
  ink(ctx, 'detail')
  eyes(ctx, 0.09, -0.185, 0.028, 0.04, faceMood(m, 0.4), COAT.duckling)
}
/**
 * A cat of the family: animals.ts's one cat in `coat`, walking while the family walks and
 * sitting while it waits or once it is across, its near paw waving when it answers; `k`
 * scales it, a kitten's head bigger for its size. The cat inks itself, so the figure's
 * backing pass draws nothing for it. Facing right, feet at the origin.
 */
function crossingCat(p: Pen, m: Moment, coat: CatCoat, k: number) {
  if (p.back) return
  const walking = m.step >= 0
  scaled(p.ctx, k, () =>
    drawCat(
      p.ctx,
      {
        coat,
        pose: walking ? 'walk' : 'sit',
        eyes: faceMood(m, k),
        meow: m.wave > 0.05,
        tail: 0.2 * Math.sin(TAU * m.t * 0.6),
        lift: 0,
        tilt: 0,
        step: walking ? m.step : 0,
        wave: m.wave * (0.8 + 0.2 * Math.sin(TAU * m.waggle)),
        kitten: k < 1,
      },
      detail(SIZE.cat),
    ),
  )
}
/** A hedgehog: a round spiny back, a cream face with a pointed snout, an apple (for a hoglet a leaf) on its spines; `k` scales it. Facing right, feet at the origin. */
function drawHedgehog(p: Pen, m: Moment, k: number) {
  const ctx = p.ctx
  ctx.save()
  ctx.scale(k, k)
  for (const [lx, ph] of [
    [-0.09, 0],
    [0.07, 0.5],
  ] as const) {
    ctx.beginPath()
    ctx.ellipse(lx + 0.03 * legSwing(m, ph), -0.02, 0.04, 0.022, 0, 0, TAU)
    fill(p, COAT.hogFace)
  }
  // The spines: points all round the back, from the rump over the top to behind the face.
  ctx.beginPath()
  const n = 11
  const cx = -0.04
  const cy = -0.07
  ctx.moveTo(cx - 0.2, -0.03)
  for (let i = 0; i <= n; i++) {
    const a = Math.PI * (1.02 + (0.88 * i) / n)
    const tip = Math.PI * (1.02 + (0.88 * (i + 0.5)) / n)
    ctx.lineTo(cx + Math.cos(a) * 0.2, cy + Math.sin(a) * 0.19)
    if (i < n) ctx.lineTo(cx + Math.cos(tip) * 0.27, cy + Math.sin(tip) * 0.26)
  }
  ctx.lineTo(0.1, -0.03)
  ctx.closePath()
  fill(p, COAT.spines)
  // The face and snout, over the front of the spines.
  ctx.beginPath()
  ctx.moveTo(0.02, -0.03)
  ctx.quadraticCurveTo(-0.02, -0.17, 0.08, -0.19)
  ctx.quadraticCurveTo(0.16, -0.19, 0.27, -0.09)
  ctx.quadraticCurveTo(0.2, -0.03, 0.02, -0.03)
  ctx.closePath()
  fill(p, COAT.hogFace)
  if (k >= 1) {
    circlePath(ctx, -0.07, -0.32, 0.065)
    fill(p, COAT.apple)
  } else {
    ctx.beginPath()
    ctx.ellipse(-0.06, -0.31, 0.075, 0.032, -0.4, 0, TAU)
    fill(p, COAT.leaf)
  }
  // The near paw, up when it waves.
  ctx.save()
  ctx.translate(0.12, -0.05)
  ctx.rotate(-1.4 * m.wave * (0.7 + 0.3 * Math.sin(TAU * m.waggle)))
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(0.05, 0.03)
  limb(p, 0.04, COAT.hogFace)
  ctx.restore()
  if (!p.back) {
    if (k >= 1) {
      ctx.beginPath()
      ctx.moveTo(-0.07, -0.38)
      ctx.lineTo(-0.06, -0.42)
      ink(ctx, 'detail')
    }
    ctx.beginPath()
    for (let i = 0; i < 4; i++) {
      const a = Math.PI * (1.2 + 0.15 * i)
      ctx.moveTo(cx + Math.cos(a) * 0.08, cy + Math.sin(a) * 0.08)
      ctx.lineTo(cx + Math.cos(a) * 0.15, cy + Math.sin(a) * 0.15)
    }
    ctx.lineWidth = 0.022
    ctx.strokeStyle = COAT.spinesDark
    ctx.stroke()
    circlePath(ctx, 0.27, -0.093, 0.024)
    flat(ctx, INK)
    eyes(ctx, 0.15, -0.13, 0.036, 0.05, faceMood(m, k * 0.3), COAT.hogFace)
    blush(ctx, 0.14, -0.08, 0.022)
    if (m.wave > 0.05) smile(ctx, 0.2, -0.07, 0.035, true, COAT.hogFace)
  }
  ctx.restore()
}
/** A cow (or a brown calf, smaller, no horns): a patched body on four sturdy legs, a big pink muzzle, a bell; facing right, feet at the origin. */
function drawCow(p: Pen, m: Moment, calf: boolean) {
  const ctx = p.ctx
  const k = calf ? 0.64 : 1
  const coat = calf ? COAT.calf : COAT.cow
  const patch = calf ? COAT.cow : COAT.patch
  ctx.save()
  ctx.scale(k, k)
  const leg = (x: number, ph: number, colour: string, up: number) => {
    const fx = x + 0.06 * legSwing(m, ph)
    ctx.beginPath()
    ctx.moveTo(x, -0.42)
    if (up > 0) ctx.lineTo(x + 0.2 * up, -0.42 + 0.36 * (1 - up) - 0.04 * up + 0.04 * Math.sin(TAU * m.waggle))
    else ctx.lineTo(fx, -0.06)
    limb(p, 0.13, colour)
    if (!p.back && up === 0) {
      ctx.beginPath()
      ctx.ellipse(fx, -0.04, 0.07, 0.04, 0, 0, TAU)
      flat(ctx, COAT.hoof)
    }
  }
  leg(-0.34, 0.5, coat, 0)
  leg(0.18, 0, coat, 0)
  // The tail with its tuft.
  ctx.beginPath()
  ctx.moveTo(-0.47, -0.7)
  ctx.quadraticCurveTo(-0.6, -0.58, -0.56, -0.4 + 0.02 * Math.sin(TAU * m.t * 0.5))
  limb(p, 0.03, coat)
  circlePath(ctx, -0.56, -0.38, 0.045)
  fill(p, patch)
  roundRectPath(ctx, -0.5, -0.8, 0.86, 0.42, 0.17)
  fill(p, coat)
  if (!p.back) {
    ctx.save()
    roundRectPath(ctx, -0.5, -0.8, 0.86, 0.42, 0.17)
    ctx.clip()
    puffs(ctx, [-0.28, -0.73, 0.13, -0.17, -0.66, 0.1], patch)
    puffs(ctx, [0.12, -0.45, 0.12, 0.22, -0.52, 0.08], patch)
    ctx.restore()
    roundRectPath(ctx, -0.5, -0.8, 0.86, 0.42, 0.17)
    ink(ctx, 'line')
  }
  leg(-0.28, 0, coat, 0)
  leg(0.24, 0.5, coat, m.wave)
  // The head: ears, horns (not on the calf), the face, the big muzzle; the bell under it.
  ctx.save()
  ctx.translate(0.42, -0.76)
  const hk = calf ? 1.25 : 1
  ctx.scale(hk, hk)
  if (!calf) {
    for (const hx of [-0.08, 0.06]) {
      ctx.beginPath()
      ctx.moveTo(hx - 0.02, -0.14)
      ctx.quadraticCurveTo(hx - 0.03, -0.22, hx + 0.03, -0.25)
      limb(p, 0.035, COAT.horn)
    }
  }
  ctx.beginPath()
  ctx.ellipse(-0.17, -0.06, 0.09, 0.04, 0.35, 0, TAU)
  fill(p, coat)
  roundRectPath(ctx, -0.14, -0.17, 0.27, 0.27, 0.12)
  fill(p, coat)
  ctx.beginPath()
  ctx.ellipse(0.07, 0.06, 0.12, 0.09, 0, 0, TAU)
  fill(p, COAT.muzzle)
  if (!p.back) {
    ctx.beginPath()
    ctx.arc(0.11, 0.05, 0.016, 0, TAU)
    ctx.moveTo(0.066, 0.055)
    ctx.arc(0.05, 0.055, 0.016, 0, TAU)
    flat(ctx, COAT.hoof)
    eyes(ctx, 0.05, -0.07, 0.042, 0.075, faceMood(m, calf ? 0.7 : 0.2), coat)
    if (m.wave > 0.05) smile(ctx, 0.08, 0.1, 0.06, true, COAT.muzzle)
  }
  ctx.restore()
  circlePath(ctx, 0.36, -0.58, 0.055)
  fill(p, COAT.bell)
  if (!p.back) shine(ctx, 0.36, -0.58, 0.055)
  ctx.restore()
}
/** Circles as one blob in a figure's two passes. */
function blobPen(p: Pen, xyr: readonly number[], colour: string) {
  const ctx = p.ctx
  ctx.beginPath()
  for (let i = 0; i < xyr.length; i += 3) {
    ctx.moveTo(xyr[i]! + xyr[i + 2]!, xyr[i + 1]!)
    ctx.arc(xyr[i]!, xyr[i + 1]!, xyr[i + 2]!, 0, TAU)
  }
  if (p.back) {
    ctx.lineWidth = 2 * lw('edge') - lw('line')
    ctx.strokeStyle = INK
    ctx.stroke()
    return
  }
  blob(ctx, xyr, colour, 'line')
}
/** A kitten is this much of a grown cat. */
const KITTEN = 0.62
/** Each beast's height (for its detail and its shadow's width) and drawing. */
const BEASTS: Record<Beast, { h: number; w: number; draw: (p: Pen, m: Moment) => void }> = {
  duck: { h: 0.42, w: 0.38, draw: drawDuck },
  duckling: { h: 0.22, w: 0.2, draw: drawDuckling },
  cat: { h: SIZE.cat, w: 0.5, draw: (p, m) => crossingCat(p, m, 'ginger', 1) },
  kitten: { h: SIZE.cat * KITTEN, w: 0.32, draw: (p, m) => crossingCat(p, m, 'ginger', KITTEN) },
  greyKitten: { h: SIZE.cat * KITTEN, w: 0.32, draw: (p, m) => crossingCat(p, m, 'grey', KITTEN) },
  hedgehog: { h: 0.34, w: 0.46, draw: (p, m) => drawHedgehog(p, m, 1) },
  hoglet: { h: 0.22, w: 0.3, draw: (p, m) => drawHedgehog(p, m, 0.62) },
  cow: { h: 1.0, w: 1.0, draw: (p, m) => drawCow(p, m, false) },
  calf: { h: 0.66, w: 0.66, draw: (p, m) => drawCow(p, m, true) },
}

/** A family crossing the road, `u` from 0 (about to step out) to 1 (across), `answer` seconds since they answered the horn; origin on the road at the crossing. */
export function drawCrosser(ctx: CanvasRenderingContext2D, who: Crosser, u: number, answer: number, t: number): void {
  const fam = FAMILIES[who]
  const k = clamp01(u)
  // An easy start, then a steady walk.
  const d = (CROSS_LEN * (k < 0.2 ? (k * k) / 0.4 : k - 0.1)) / 0.9
  const a = Math.min(Math.max(answer, -1), 1e3)
  const size = fam.size
  let behind = 0
  const placed = fam.members.map((mem, i) => {
    behind += mem.gap * size
    const s = d - behind
    const x = fam.start + (s >= 0 ? s * CROSS_DIR[0] : -s * QUEUE_DIR[0])
    const y = s >= 0 ? s * CROSS_DIR[1] : -s * QUEUE_DIR[1]
    return { mem, i, x, y }
  })
  ctx.save()
  // Back to front: the ones further back first.
  for (const { mem, i, x, y } of [...placed].sort((p, q) => p.y - q.y)) {
    const beast = BEASTS[mem.beast]
    const w = a - i * WAVE_EVERY
    const wave = w >= 0 && w < WAVE_FOR ? smooth(0, 0.2, w) * (1 - smooth(WAVE_FOR - 0.3, WAVE_FOR, w)) : 0
    const walking = k > 0 && k < 1
    const tall = beast.h * size
    const stride = tall * 1.4
    const step = walking ? loop(d - i * 0.13, stride, 0) : -1
    const hop = (w >= 0 && w < 0.4 ? 0.24 * tall * arch(w / 0.4) : 0) + (walking ? 0.05 * tall * Math.abs(Math.sin(TAU * step)) : 0)
    const idle = walking ? 0 : 0.012 * Math.sin(TAU * loop(t, 1.6, phaseOf(i)))
    ctx.save()
    ctx.translate(x, y)
    groundShadow(ctx, beast.w * size)
    ctx.translate(0, -hop)
    // They face the truck, on their left.
    ctx.scale(-size, size * (1 + idle))
    if (walking) ctx.rotate(0.06 * Math.sin(TAU * step))
    figure(ctx, tall, (p) => beast.draw(p, { step, wave, waggle: w * 2.4, t: t + i * 0.7 }))
    ctx.restore()
  }
  ctx.restore()
}

// ---------------------------------------------------------------------------------------
// The ramp, the present, the surprises, the sign

/** The ramp's depth across the road (its deck recedes up-right by this, as a box's top does), centred on the line the wheels roll. */
const RAMP_D = 0.46

/** The ramp, its lip at the origin (on the ground), rising from 3 m behind it. */
export function drawRamp(ctx: CanvasRenderingContext2D, t: number): void {
  void t
  const wood = MATERIAL_LOOK.planks
  const d = RAMP_D / 2
  const { run, rise } = RAMP
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.save()
  ctx.translate(-run / 2, 0)
  groundShadow(ctx, run + 0.5)
  ctx.restore()
  // The deck (lit top face), the lip's face (dark right face), the side (front face) with its struts.
  ctx.beginPath()
  ctx.moveTo(-run - d, d)
  ctx.lineTo(-d, -rise + d)
  ctx.lineTo(d, -rise - d)
  ctx.lineTo(-run + d, -d)
  ctx.closePath()
  part(ctx, wood.top, 'line')
  ctx.save()
  ctx.clip()
  // Plank joints across the deck, the hazard stripes at the lip, two chevrons pointing up.
  ctx.beginPath()
  for (let k = 1; k < 9; k++) {
    const x = -run + (k * run) / 9
    const y = -(rise * (x + run)) / run
    ctx.moveTo(x - d, y + d)
    ctx.lineTo(x + d, y - d)
  }
  ctx.lineWidth = lw('detail')
  ctx.strokeStyle = wood.mark
  ctx.stroke()
  const slope = rise / run
  for (let k = 0; k < 6; k++) {
    const x = -0.6 + k * 0.1
    const y = -slope * (x + run)
    ctx.beginPath()
    ctx.moveTo(x - d, y + d)
    ctx.lineTo(x + 0.1 - d, y + d - 0.1 * slope)
    ctx.lineTo(x + 0.1 + d, y - d - 0.1 * slope)
    ctx.lineTo(x + d, y - d)
    ctx.closePath()
    flat(ctx, k % 2 === 0 ? C.hazard : INK)
  }
  // Two yellow arrows up the deck: go fast!
  for (const cx of [-2.15, -1.35]) {
    ctx.save()
    ctx.translate(cx, -slope * (cx + run))
    ctx.rotate(-Math.atan(slope))
    ctx.beginPath()
    ctx.moveTo(-0.16, -0.13)
    ctx.lineTo(0.02, 0)
    ctx.lineTo(-0.16, 0.13)
    ctx.lineTo(-0.04, 0.13)
    ctx.lineTo(0.14, 0)
    ctx.lineTo(-0.04, -0.13)
    ctx.closePath()
    part(ctx, C.hazard, 'detail')
    ctx.restore()
  }
  ctx.restore()
  ctx.beginPath()
  ctx.moveTo(-d, -rise + d)
  ctx.lineTo(d, -rise - d)
  ctx.lineTo(d, -d)
  ctx.lineTo(-d, d)
  ctx.closePath()
  part(ctx, wood.side, 'line')
  ctx.beginPath()
  ctx.moveTo(-run - d, d)
  ctx.lineTo(-d, -rise + d)
  ctx.lineTo(-d, d)
  ctx.closePath()
  part(ctx, wood.face, 'line')
  ctx.beginPath()
  for (const k of [0.3, 0.55, 0.8]) {
    const x = -run - d + k * run
    ctx.moveTo(x, d - 0.02)
    ctx.lineTo(x, d - rise * k + 0.03)
  }
  ctx.moveTo(-run - d + 0.3 * run, d - rise * 0.3 + 0.03)
  ctx.lineTo(-d, d - 0.02)
  ctx.lineWidth = lw('line')
  ctx.strokeStyle = wood.side
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(-run - d, d)
  ctx.lineTo(-d, -rise + d)
  ctx.lineTo(d, -rise - d)
  ctx.lineTo(d, -d)
  ctx.lineTo(-d, d)
  ctx.closePath()
  ink(ctx, 'edge')
  ctx.restore()
}

/** The present: its box's front w by h, its lid's overhang and height, and the opening: the lid flies off over LID_FLY and the sparkles rise over SPARKLE_FOR. */
const PRESENT = { w: 0.62, h: 0.42, depth: 0.12, lid: 0.04, lidH: 0.14 }
const LID_FLY = 0.75
const SPARKLE_FOR = 1.4

/** The lid with its bow, drawn about its own bottom middle. */
function drawLid(ctx: CanvasRenderingContext2D, t: number) {
  const { w, depth, lid, lidH } = PRESENT
  const lw2 = w + 2 * lid
  box(ctx, -lw2 / 2 - depth / 2, -lidH, lw2, lidH, GIFT, depth, true, true, 'line')
  ctx.fillStyle = GIFT.ribbon.face
  ctx.fillRect(-0.06 - depth / 2, -lidH, 0.12, lidH)
  ctx.beginPath()
  ctx.moveTo(-0.06 - depth / 2, -lidH)
  ctx.lineTo(-0.06 + depth / 2, -lidH - depth)
  ctx.lineTo(0.06 + depth / 2, -lidH - depth)
  ctx.lineTo(0.06 - depth / 2, -lidH)
  ctx.closePath()
  flat(ctx, GIFT.ribbon.top)
  // The bow: two loops and a knot, breathing a little.
  const k = 1 + 0.04 * Math.sin(TAU * loop(t, 2.2, 0))
  const by = -lidH - depth / 2
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.ellipse(s * 0.11 * k, by - 0.07 * k, 0.11 * k, 0.065 * k, s * -0.55, 0, TAU)
    part(ctx, GIFT.ribbon.face, 'line')
  }
  circlePath(ctx, 0, by - 0.03, 0.045)
  part(ctx, GIFT.ribbon.side, 'line')
}

/** The present box with a bow, `open` seconds since it opened (-1 shut); origin at its bottom centre, about 0.8 m. */
export function drawPresent(ctx: CanvasRenderingContext2D, t: number, open: number): void {
  const { w, h, depth } = PRESENT
  const age = open < 0 ? -1 : Math.min(open, 1e3)
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  groundShadow(ctx, w + 0.2)
  // Shut, it gives a little jump of excitement every few seconds.
  const jump = age < 0 ? loop(t, 3.2, 0.4) : 1
  const [sx, sy] = squash(age < 0 ? (jump * 3.2 < 1 ? jump * 3.2 : 1) : age)
  ctx.scale(sx, sy)
  if (age >= 0) {
    // The glow inside, and the sparkles rising out of it.
    const glow = smooth(0.1, 0.5, age)
    circlePath(ctx, depth / 2, -h - 0.05, 0.42 * glow)
    flat(ctx, C.light)
    for (let i = 0; i < 6; i++) {
      const u = age < SPARKLE_FOR ? (age - i * 0.08) / (SPARKLE_FOR - 0.4) : loop(age, 1.6, i / 6)
      if (u < 0 || u > 1) continue
      const a = -Math.PI / 2 + (i - 2.5) * 0.32
      const r = 0.15 + 0.75 * u
      sparkle(ctx, depth / 2 + Math.cos(a) * r * 0.8, -h - 0.1 + Math.sin(a) * r, 0.18 * arch(u), i % 2 === 0 ? C.sparkle : C.sparkleWarm)
    }
  }
  box(ctx, -w / 2 - depth / 2, -h, w, h, GIFT, depth, true, true, 'line')
  if (detail(0.8) !== 'S') {
    ctx.save()
    ctx.beginPath()
    ctx.rect(-w / 2 - depth / 2, -h, w, h)
    ctx.clip()
    for (let i = 0; i < 6; i++) {
      circlePath(ctx, -w / 2 - depth / 2 + 0.08 + (i % 3) * 0.22 + (i >= 3 ? 0.11 : 0), -h + 0.1 + Math.floor(i / 3) * 0.2, 0.035)
      flat(ctx, GIFT.dot)
    }
    ctx.restore()
  }
  ctx.fillStyle = GIFT.ribbon.face
  ctx.fillRect(-0.06 - depth / 2, -h, 0.12, h)
  ctx.beginPath()
  ctx.moveTo(w / 2 - depth / 2, -h * 0.55)
  ctx.lineTo(w / 2 + depth / 2, -h * 0.55 - depth)
  ctx.lineTo(w / 2 + depth / 2, -h * 0.55 - depth + 0.1)
  ctx.lineTo(w / 2 - depth / 2, -h * 0.55 + 0.1)
  ctx.closePath()
  flat(ctx, GIFT.ribbon.side)
  ctx.beginPath()
  ctx.rect(-0.06 - depth / 2, -h, 0.12, h)
  ink(ctx, 'detail')
  // The lid: on top while shut, flying up and coming to rest leaning on the right when opened.
  ctx.save()
  if (age < 0) ctx.translate(0, -h)
  else {
    const u = smooth(0, LID_FLY, age)
    const up = 0.6 * arch(Math.min(1, age / LID_FLY))
    ctx.translate(mix(0, w / 2 + 0.28, u), mix(-h, -0.26, u) - up)
    ctx.rotate(mix(0, 1.25, u))
  }
  drawLid(ctx, t)
  ctx.restore()
  ctx.restore()
}

/** The train's show over TRAIN_FOR: the barrier comes down, the train passes from PASS[0] to PASS[1] of it, the barrier goes up; the lamp blinks twice a second while it is down. */
const PASS = [0.08, 0.88] as const
const ARM_UP = 0.9
/** The train along the track: where its nose starts (at the track's back end, behind the bush) and ends (its tail past the bottom of the screen), metres along the track from the road's middle. */
const TRAIN_FROM = RAILS.from
const TRAIN_TO = 21
/** The train's cars, front to back: their length and kind. */
const CARS = [
  { len: 2.5, kind: 'engine' },
  { len: 2.0, kind: 'logs' },
  { len: 2.0, kind: 'gems' },
] as const
const CAR_GAP = 0.2

/** The train, its nose at the origin facing right, wheels on y = 0: nothing of it behind `cut` (metres along it) shows but the engine's smoke. */
function drawTrain(ctx: CanvasRenderingContext2D, t: number, roll: number, cut: number) {
  // The smoke from the engine's chimney.
  for (let i = 0; i < 3; i++) {
    const u = loop(t, 0.7, i / 3)
    const r = 0.1 + 0.18 * u
    blob(ctx, [-0.55 - 0.9 * u, -1.25 - 0.5 * u, r * (1 - smooth(0.75, 1, u))], TRAIN.smoke, 'detail')
  }
  ctx.save()
  ctx.beginPath()
  ctx.rect(cut, -2, Math.max(0, 1 - cut), 2.3)
  ctx.clip()
  let x = 0
  const wheel = 0.22
  for (const car of CARS) {
    const x0 = x - car.len
    const faces = car.kind === 'engine' ? TRAIN.engine : TRAIN.wagons[car.kind === 'logs' ? 0 : 1]!
    // The coupling to the car in front.
    if (car.kind !== 'engine') {
      ctx.beginPath()
      ctx.moveTo(x, -0.35)
      ctx.lineTo(x + CAR_GAP, -0.35)
      tube(ctx, 0.05, TRAIN.buffer)
    }
    if (car.kind === 'engine') {
      // The boiler, the chimney, the cab with its yellow roof.
      const cab = x0 + 0.95
      ctx.beginPath()
      ctx.moveTo(x - 0.62, -0.95)
      ctx.lineTo(x - 0.66, -1.28)
      ctx.lineTo(x - 0.4, -1.28)
      ctx.lineTo(x - 0.44, -0.95)
      ctx.closePath()
      part(ctx, TRAIN.chimney, 'line')
      roundRectPath(ctx, cab, -0.95, x - cab + 0.02, 0.6, 0.14)
      part(ctx, faces.face, 'line')
      circlePath(ctx, x - 0.02, -0.66, 0.1)
      part(ctx, C.sparkleWarm, 'detail')
      box(ctx, x0, -1.3, 0.95, 0.95, faces, 0.08, false, false, 'line')
      roundRectPath(ctx, x0 + 0.22, -1.18, 0.5, 0.36, 0.06)
      part(ctx, C.glassTint, 'detail')
      box(ctx, x0 - 0.06, -1.42, 1.07, 0.12, TRAIN.roof, 0.08, true, true, 'line')
      ctx.beginPath()
      ctx.moveTo(x0, -0.35)
      ctx.lineTo(x + 0.12, -0.35)
      ctx.lineTo(x + 0.02, -0.22)
      ctx.lineTo(x0, -0.22)
      ctx.closePath()
      part(ctx, TRAIN.buffer, 'line')
    } else {
      // A wagon with its load heaped on top.
      const goods: Good[] = car.kind === 'logs' ? ['log', 'log', 'log'] : ['gem', 'rock', 'gem']
      goods.forEach((good, i) => {
        ctx.save()
        ctx.translate(x0 + 0.45 + i * 0.55, -0.8 + (i === 1 ? -0.06 : 0))
        ctx.scale(0.9, 0.9)
        drawGood(ctx, good, t + i)
        ctx.restore()
      })
      box(ctx, x0, -0.86, car.len, 0.56, faces, 0.08, false, false, 'line')
      ctx.beginPath()
      for (const k of [0.33, 0.66]) {
        ctx.moveTo(x0 + car.len * k, -0.82)
        ctx.lineTo(x0 + car.len * k, -0.34)
      }
      ink(ctx, 'detail')
    }
    for (const wx of [x0 + 0.42, x - 0.42]) {
      circlePath(ctx, wx, -wheel, wheel)
      part(ctx, C.tyre, 'line')
      circlePath(ctx, wx, -wheel, wheel * 0.45)
      part(ctx, C.hub, 'detail')
      ctx.beginPath()
      ctx.moveTo(wx, -wheel)
      ctx.lineTo(wx + Math.cos(roll / wheel) * wheel * 0.45, -wheel + Math.sin(roll / wheel) * wheel * 0.45)
      ink(ctx, 'detail')
    }
    x = x0 - CAR_GAP
  }
  ctx.restore()
}

/** The balloon's flight: in from BALLOON_IN metres to the left and BALLOON_LOW lower as u runs to 0.5, the gem dropped there, then off up and to the right. */
const BALLOON_IN = 10
const BALLOON_LOW = 1.2
const BALLOON_OFF = [7, 4] as const

/** The hot-air balloon: rainbow gores, ropes, a wicker basket with a cat in it waving, and the gem hanging under it until `held` is false; origin at the gem's middle. */
function drawBalloon(ctx: CanvasRenderingContext2D, t: number, held: boolean, wave: number) {
  const top = -0.62
  // The gem in its little net under the basket.
  if (held) {
    ctx.beginPath()
    ctx.moveTo(0, top + 0.08)
    ctx.lineTo(0, -0.22)
    ink(ctx, 'detail')
    ctx.save()
    ctx.translate(0, 0.23)
    drawGood(ctx, 'gem', t)
    ctx.restore()
  }
  // The basket, the cat in it.
  const by = top - 0.45
  ctx.save()
  ctx.translate(-0.06, by)
  drawBasketCat(ctx, t, wave)
  ctx.restore()
  box(ctx, -0.34, by, 0.6, 0.45, BALLOON.basket, 0.08, true, true, 'line')
  ctx.beginPath()
  for (const k of [0.15, 0.3]) {
    ctx.moveTo(-0.34, by + k)
    ctx.lineTo(0.26, by + k)
  }
  ctx.lineWidth = lw('detail')
  ctx.strokeStyle = BALLOON.basket.mark
  ctx.stroke()
  // The ropes, the envelope of rainbow gores, its shine.
  const ey = by - 1.55
  ctx.beginPath()
  for (const [ax, bx] of [
    [-0.34, -0.62],
    [0.26, 0.58],
  ] as const) {
    ctx.moveTo(ax, by)
    ctx.lineTo(bx, ey + 0.82)
  }
  ctx.lineWidth = lw('line')
  ctx.strokeStyle = BALLOON.rope
  ctx.stroke()
  const env = () => {
    ctx.beginPath()
    ctx.moveTo(-0.32, ey + 1.0)
    ctx.bezierCurveTo(-1.05, ey + 0.55, -1.15, ey - 0.35, -0.85, ey - 0.75)
    ctx.bezierCurveTo(-0.5, ey - 1.2, 0.5, ey - 1.2, 0.85, ey - 0.75)
    ctx.bezierCurveTo(1.15, ey - 0.35, 1.05, ey + 0.55, 0.32, ey + 1.0)
    ctx.closePath()
  }
  env()
  ctx.fillStyle = C.rainbow[0]!
  ctx.fill()
  ctx.save()
  env()
  ctx.clip()
  for (let i = 1; i < C.rainbow.length; i++) {
    const x0 = -1.2 + (i * 2.4) / C.rainbow.length
    ctx.beginPath()
    ctx.moveTo(x0 * 0.3, ey + 1.1)
    ctx.quadraticCurveTo(x0 * 1.1, ey - 0.2, x0 * 0.6, ey - 1.3)
    ctx.lineTo(1.4, ey - 1.3)
    ctx.lineTo(1.4, ey + 1.1)
    ctx.closePath()
    flat(ctx, C.rainbow[i]!)
  }
  ctx.restore()
  env()
  ink(ctx, 'edge')
  ctx.beginPath()
  ctx.arc(-0.3, ey - 0.35, 0.6, Math.PI * 1.08, Math.PI * 1.32)
  ctx.lineWidth = 0.08
  ctx.strokeStyle = C.white
  ctx.stroke()
}
/** The balloon's cat: animals.ts's cream cat peeking over the basket's rim in a blue scarf, its paws on the rim, one paw up when it waves. Origin on the rim under its middle. */
function drawBasketCat(ctx: CanvasRenderingContext2D, t: number, wave: number) {
  roundRectPath(ctx, -0.12, -0.07, 0.24, 0.07, 0.03)
  part(ctx, BALLOON.scarf, 'line')
  drawCat(
    ctx,
    {
      coat: 'cream',
      pose: 'peek',
      eyes: wave > 0.1 ? 'happy' : loop(t, 3.9, 0.5) > 0.96 ? 'closed' : 'open',
      meow: wave > 0.1,
      tail: 0,
      lift: 0,
      tilt: 0,
      step: 0,
      wave: wave * (0.8 + 0.2 * Math.sin(TAU * t * 2.4)),
      kitten: false,
    },
    detail(SIZE.cat),
  )
}

/** A surprise `u` from 0 to 1 through its show (the train passing the crossing, the balloon floating over and dropping its gem); origin on the road at its x. */
export function drawSurprise(ctx: CanvasRenderingContext2D, what: Surprise, u: number, t: number): void {
  const k = clamp01(u)
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  if (what === 'balloon') {
    const sway = 0.03 * Math.sin(TAU * loop(t, 3.4, 0.2))
    const x = k <= 0.5 ? -BALLOON_IN * (1 - 2 * k) : BALLOON_OFF[0] * smooth(0.5, 1, k)
    const y = k <= 0.5 ? -BALLOON_UP - BALLOON_LOW * (1 - 2 * k) : -BALLOON_UP - BALLOON_OFF[1] * smooth(0.5, 1, k) ** 1.5
    const wave = smooth(0.38, 0.47, k) * (1 - smooth(0.62, 0.75, k))
    ctx.translate(x, y)
    ctx.rotate(sway)
    drawBalloon(ctx, t, k < 0.5, wave)
  } else {
    // The train, coming out from behind the bush at the track's back end (its smoke rising over the bush first).
    if (k > PASS[0] && k < PASS[1]) {
      const along = mix(TRAIN_FROM, TRAIN_TO, (k - PASS[0]) / (PASS[1] - PASS[0]))
      ctx.save()
      ctx.translate(along * TRACK.cos, DASH.y + along * TRACK.sin)
      ctx.rotate(TRACK_A)
      drawTrain(ctx, t, along, RAILS.from - along)
      ctx.restore()
    }
    blob(ctx, TRACK_BUSH, BOX.grass.side, 'line')
    ctx.beginPath()
    ctx.moveTo(-2.75, -1.75)
    ctx.quadraticCurveTo(-2.6, -1.92, -2.4, -1.86)
    ctx.moveTo(-2.15, -2.3)
    ctx.quadraticCurveTo(-2.0, -2.45, -1.8, -2.4)
    ctx.moveTo(-2.15, -1.3)
    ctx.quadraticCurveTo(-2.0, -1.45, -1.8, -1.4)
    ctx.lineWidth = lw('detail')
    ctx.strokeStyle = BOX.grass.top
    ctx.stroke()
    // The barrier's arm, across the road and then swung up about its pivot, and its blinking lamp.
    const down = k < ARM_UP ? 1 : 1 - smooth(ARM_UP, 1, k)
    const bx = BARRIER.x
    const by = BARRIER.y - BARRIER.h
    ctx.save()
    ctx.translate(bx, by)
    ctx.rotate((Math.PI / 2) * (1 - down))
    roundRectPath(ctx, -BARRIER.arm, -0.05, BARRIER.arm + 0.12, 0.1, 0.04)
    part(ctx, C.white, 'line')
    ctx.fillStyle = ROADS.barrier
    for (let i = 0; i < 4; i++) ctx.fillRect(-BARRIER.arm + 0.06 + i * 0.36, -0.04, 0.18, 0.08)
    ctx.restore()
    circlePath(ctx, bx, by, 0.05)
    part(ctx, BOX.steel.side, 'detail')
    const lit = down > 0.5 && Math.floor(t * 2) % 2 === 0
    circlePath(ctx, bx, BARRIER.y - BARRIER.h - 0.42, 0.13)
    part(ctx, lit ? ROADS.lampOn : ROADS.lampOff, 'line')
    if (lit) {
      circlePath(ctx, bx, BARRIER.y - BARRIER.h - 0.42, 0.3)
      flat(ctx, C.light)
    }
  }
  ctx.restore()
}

/** The street sign that ends a trip (a house picture), origin on the road's ground line at its x: it stands on the verge behind the road, so the truck rolls past it. */
export function drawHomeSign(ctx: CanvasRenderingContext2D, t: number): void {
  void t
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.translate(0, SIGN_FOOT)
  groundShadow(ctx, 0.5)
  // Flowers at its foot.
  for (const [fx, fc] of [
    [-0.22, ROADS.flowers[2]!],
    [0.24, ROADS.flowers[1]!],
  ] as const) {
    ctx.beginPath()
    ctx.moveTo(fx, 0)
    ctx.lineTo(fx, -0.22)
    tube(ctx, 0.03, BOX.grass.face)
    circlePath(ctx, fx, -0.26, 0.07)
    part(ctx, fc, 'detail')
    circlePath(ctx, fx, -0.26, 0.028)
    flat(ctx, BOX.yellow.face)
  }
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(0, -1.5 - SIGN_FOOT)
  tube(ctx, 0.1, BOX.steel.top)
  // The board, a box with its lit top and dark side.
  const bw = 1.06
  const bh = 0.88
  const d = 0.08
  const x0 = -bw / 2 - d / 2
  const y0 = -2.36 - SIGN_FOOT
  box(ctx, x0, y0, bw, bh, SIGN.board, d, true, true, 'edge')
  roundRectPath(ctx, x0 + 0.06, y0 + 0.06, bw - 0.12, bh - 0.12, 0.05)
  ctx.lineWidth = 0.035
  ctx.strokeStyle = C.white
  ctx.stroke()
  // The house picture: green ground, walls, a red roof, a door and a lit window, a heart over it.
  const cx = x0 + bw / 2
  ctx.fillStyle = SIGN.grass
  ctx.fillRect(x0 + 0.1, y0 + bh - 0.2, bw - 0.2, 0.1)
  ctx.beginPath()
  ctx.rect(cx - 0.24, y0 + 0.4, 0.48, 0.3)
  part(ctx, SIGN.wall, 'detail')
  ctx.beginPath()
  ctx.moveTo(cx - 0.33, y0 + 0.42)
  ctx.lineTo(cx, y0 + 0.17)
  ctx.lineTo(cx + 0.33, y0 + 0.42)
  ctx.closePath()
  part(ctx, SIGN.roof, 'detail')
  roundRectPath(ctx, cx - 0.16, y0 + 0.5, 0.1, 0.2, 0.03)
  part(ctx, SIGN.door, 'detail')
  ctx.beginPath()
  ctx.rect(cx + 0.03, y0 + 0.48, 0.12, 0.1)
  part(ctx, SIGN.window, 'detail')
  ctx.restore()
}

/** A signpost card's picture of a road: its scenery and its main goods, in a box 3 m wide and 2 m tall centred on the origin. */
export function drawRoadCard(ctx: CanvasRenderingContext2D, kind: RoadKind, t: number): void {
  const sky = SKY.day
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  roundRectPath(ctx, -1.5, -1, 3, 2, 0.22)
  ctx.clip()
  ctx.fillStyle = sky.bands[0]
  ctx.fillRect(-1.5, -1, 3, 2)
  ctx.fillStyle = sky.bands[1]
  ctx.fillRect(-1.5, -0.5, 3, 1.5)
  ctx.fillStyle = sky.bands[2]
  ctx.fillRect(-1.5, -0.15, 3, 1.15)
  const cloud = -1.0 + 0.12 * Math.sin((TAU * t) / 9)
  ctx.beginPath()
  for (const [cx, cy, r] of [
    [cloud, -0.68, 0.13],
    [cloud + 0.17, -0.74, 0.17],
    [cloud + 0.36, -0.68, 0.12],
  ] as const) {
    ctx.moveTo(cx + r, cy)
    ctx.arc(cx, cy, r, 0, TAU)
  }
  flat(ctx, C.cloud)
  /** A good drawn bigger on the card, so it reads at the card's size. */
  const good = (g: Good, x: number, y: number, k: number) => {
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(k, k)
    drawGood(ctx, g, t + x)
    ctx.restore()
  }
  switch (kind) {
    case 'forest':
      ctx.save()
      ctx.translate(0, 0.15)
      hillPath(ctx, 1.5, 0.35, 0.85)
      flat(ctx, BACK.hillMid)
      for (const [x, h] of [
        [-1.05, 0.85],
        [-0.55, 1.0],
        [-0.05, 0.88],
        [0.5, 1.0],
        [1.05, 0.8],
      ] as const)
        pine(ctx, x, h, BACK.pineNear, BACK.trunk)
      ctx.restore()
      ctx.fillStyle = GROUND.forest.field
      ctx.fillRect(-1.5, 0.2, 3, 0.8)
      ctx.fillStyle = ROADS.water
      ctx.fillRect(0.55, 0.2, 0.55, 0.8)
      good('clay', 1.15, 0.7, 1.1)
      good('log', -0.95, 0.75, 1.35)
      good('log', -0.25, 0.8, 1.35)
      good('log', -0.6, 0.45, 1.2)
      break
    case 'beach': {
      ctx.fillStyle = BACK.seaMid
      ctx.fillRect(-1.5, -0.15, 3, 0.6)
      flatSun(ctx, 1.0, -0.55, 0.22, sky.sun, sky.halo)
      ctx.fillStyle = BACK.foam
      for (const x of [-1.0, -0.2, 0.6]) {
        ctx.beginPath()
        ctx.ellipse(x + 0.1 * Math.sin(TAU * (t / 3 + x)), 0.05, 0.22, 0.03, 0, 0, TAU)
        ctx.fill()
      }
      ctx.fillStyle = GROUND.beach.field
      ctx.fillRect(-1.5, 0.3, 3, 0.7)
      ctx.save()
      ctx.translate(0.88, 0.42)
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(0, -0.8)
      tube(ctx, 0.04, BACK.pole)
      ctx.translate(0, -0.78)
      ctx.rotate(-0.15)
      for (let i = 0; i < 6; i++) {
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.arc(0, 0, 0.5, Math.PI + (i * Math.PI) / 6, Math.PI + ((i + 1) * Math.PI) / 6)
        ctx.closePath()
        part(ctx, i % 2 === 0 ? COAT.sign : C.white, 'detail')
      }
      ctx.restore()
      good('sand', -0.9, 0.85, 1.35)
      good('sand', -0.25, 0.8, 1.3)
      good('sand', 0.4, 0.88, 1.2)
      break
    }
    case 'hills': {
      ctx.save()
      ctx.translate(0, 0.25)
      ctx.beginPath()
      ctx.moveTo(-1.5, 0.75)
      ctx.lineTo(-1.5, 0)
      ctx.quadraticCurveTo(-0.6, -1.25, 0.2, -1.05)
      ctx.quadraticCurveTo(1.0, -0.8, 1.5, 0)
      ctx.lineTo(1.5, 0.75)
      ctx.closePath()
      flat(ctx, BACK.mountainMid)
      ctx.beginPath()
      ctx.moveTo(-0.32, -0.78)
      ctx.quadraticCurveTo(0, -1.12, 0.36, -0.95)
      ctx.lineTo(0.2, -0.82)
      ctx.lineTo(0.02, -0.9)
      ctx.closePath()
      flat(ctx, BACK.snow)
      // The tunnel's mouth with a warm lamp inside.
      ctx.beginPath()
      ctx.moveTo(-0.15, 0)
      ctx.lineTo(-0.15, -0.35)
      ctx.arc(0.2, -0.35, 0.35, Math.PI, TAU)
      ctx.lineTo(0.55, 0)
      ctx.closePath()
      part(ctx, ROADS.wall, 'line')
      circlePath(ctx, 0.2, -0.42, 0.18)
      flat(ctx, C.light)
      circlePath(ctx, 0.2, -0.42, 0.06)
      part(ctx, ROADS.lamp, 'detail')
      ctx.restore()
      ctx.fillStyle = GROUND.quarry.field
      ctx.fillRect(-1.5, 0.25, 3, 0.75)
      good('rock', -1.0, 0.85, 1.3)
      good('gem', -0.35, 0.82, 1.35)
      good('rock', 0.35, 0.88, 1.2)
      good('gem', 0.98, 0.85, 1.25)
      break
    }
  }
  ctx.restore()
  roundRectPath(ctx, -1.5, -1, 3, 2, 0.22)
  ink(ctx, 'line')
}

// ---------------------------------------------------------------------------------------
// The sheet

/** The road's usual scale, on an iPad held sideways. */
const ROAD_PPM = 70
/** The sample roads the scenes show, made once on first use. */
let samples: Record<RoadKind, RoadDef> | null = null
const sample = (kind: RoadKind) => (samples ??= { forest: makeRoad('forest', 4, 11), beach: makeRoad('beach', 6, 5), hills: makeRoad('hills', 5, 2) })[kind]

/** Where a scene's truck is at sheet time t, how fast it goes, and how far through their shows the crossers and surprises in view are. */
interface Place {
  x: number
  speed: number
  u: number
}
/** A road scene as the game shows it at ROAD_PPM: the backdrop through a view made from the sheet's own transform, the ground, the things near, the truck, what stands in front. */
function scene(kind: RoadKind, label: string, place: (def: RoadDef, t: number) => Place): SheetEntry {
  const w = 16.5
  const h = 10.25
  return at(ROAD_PPM, rect(0, 0, w, h), label, (ctx, t) => {
    const def = sample(kind)
    const { x, speed, u } = place(def, t)
    const x0 = x - w * 0.35
    const y0 = groundAt(def, x) - h * 0.74
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, w, h)
    ctx.clip()
    ctx.translate(-x0, -y0)
    const m = ctx.getTransform()
    const view: View = { w: ctx.canvas.width / pen.dpr, h: ctx.canvas.height / pen.dpr, dpr: pen.dpr, ppm: m.a / pen.dpr, x0: -m.e / m.a, y0: -m.f / m.a }
    drawRoadBackdrop(ctx, def, view, t)
    drawRoadGround(ctx, def, x0 - 1, x0 + w + 1, 0)
    for (const th of def.things) {
      if (th.x < x0 - 6 || th.x > x0 + w + 6) continue
      ctx.save()
      ctx.translate(th.x, groundAt(def, th.x))
      if (th.kind === 'pickup') drawPickup(ctx, th.good, t, phaseOf(th.x))
      else if (th.kind === 'boulder') drawBoulder(ctx, th.size, th.gem, 1, 2, 'hammer', t)
      else if (th.kind === 'crosser') drawCrosser(ctx, th.who, u, 1e4, t)
      else if (th.kind === 'ramp') drawRamp(ctx, t)
      else if (th.kind === 'present') drawPresent(ctx, t, -1)
      else drawSurprise(ctx, th.what, u, t)
      ctx.restore()
    }
    ctx.save()
    ctx.translate(x, groundAt(def, x))
    drawTruck(ctx, { look: DEFAULT_LOOK, bed: ['log', 'clay', 'rock', 'sand', 'log', 'gem'], tip: 0, roll: x, speed, honk: Infinity, flick: Infinity, stickers: def.trip - 1, driver: true, t })
    ctx.restore()
    drawRoadFront(ctx, def, x0 - 1, x0 + w + 1, t)
    ctx.restore()
  })
}
/** The truck parked in the middle of a road's first stretch of `biome`. */
const middleOf = (biome: Biome) => (def: RoadDef) => {
  const b = def.biomes.find((s) => s.biome === biome)!
  return { x: (b.from + b.to) / 2, speed: 3, u: 0 }
}
/** A road's first thing of a kind. */
const firstX = (kind: 'ramp' | 'crosser' | 'surprise' | 'boulder' | 'present') => (def: RoadDef) => def.things.find((th) => th.kind === kind)!.x
/** Stopped before the road's first crossing or train, its show replaying. */
const stopped = (kind: 'crosser' | 'surprise', show: number) => (def: RoadDef, t: number) => ({ x: stopX(def.things.find((th) => th.kind === kind)!), speed: 0, u: ((t % (show + 1.2)) - 0.6) / show })
/** Driving under the balloon at 6 m/s, as the renderer moves it: in over BALLOON_NEAR metres, off over its last 3 s. */
const underBalloon = (def: RoadDef, t: number) => {
  const bx = firstX('surprise')(def)
  const k = t % 7
  const x = bx - 2 - 25 + 6 * Math.min(k, 25 / 6) + (k > 25 / 6 ? 6 * (k - 25 / 6) : 0)
  return { x, speed: 6, u: k < 25 / 6 ? (0.5 * (6 * k)) / 25 : 0.5 + 0.5 * Math.min(1, (k - 25 / 6) / 2.8) }
}

const boulderBox = rect(-1.0, -1.95, 2.0, 2.05)
const crosserBox = rect(-1.5, -1.25, 3.0, 1.4)
/** A crossing family's box: the leader walks down toward the viewer and a little left, to the end of the walk. */
const crossingBox = rect(-2.1, -1.25, 3.6, 6.05)
/** The train's box holds its smoke over the bush and the train until its tail is past the barrier, at TRAIN_CROSSED of its show: the sheet replays the show from a moment before the train comes to there. The rest of the show replays from a moment before then, in a box as wide as the game's view at the crossing (game/camera.ts CROSSING): the last cars run out of it, and the barrier goes up. */
const trainBox = rect(-3.45, -3.2, 14.45, 7.2)
const TRAIN_CROSSED = 0.5
const leavingBox = rect(-3.45, -3.2, 7.45, 5.2)
const balloonBox = rect(-11.5, -11.5, 21, 8.5)

/** ?sheet=land: road scenes as the game shows them, then every thing on the road in its states, the surprises, the sign and the cards. */
export const LAND_SHEET: SheetEntry[] = [
  scene('forest', 'meadow, at 70 px/m', middleOf('meadow')),
  scene('forest', 'forest, at 70 px/m', middleOf('forest')),
  scene('forest', 'river and its bridge, at 70 px/m', middleOf('river')),
  scene('forest', 'town, at 70 px/m', middleOf('town')),
  scene('beach', 'dunes, at 70 px/m', middleOf('dunes')),
  scene('beach', 'beach, at 70 px/m', middleOf('beach')),
  scene('hills', 'quarry, at 70 px/m', middleOf('quarry')),
  scene('hills', 'a tunnel, at 70 px/m', (def) => ({ x: boresOf(def)[0]!.from + 6, speed: 8, u: 0 })),
  scene('hills', 'into a tunnel, at 70 px/m', (def) => ({ x: boresOf(def)[0]!.from - 6, speed: 8, u: 0 })),
  scene('forest', 'meadow into town, at 70 px/m', (def) => ({ x: def.biomes.find((b) => b.biome === 'town')!.from - 3, speed: 3, u: 0 })),
  scene('forest', 'the end of the road, at 70 px/m', (def) => ({ x: def.length - 3, speed: 2, u: 0 })),
  scene('hills', 'at a crossing (replays), at 70 px/m', stopped('crosser', CROSS_FOR)),
  scene('forest', 'at the train (replays), at 70 px/m', stopped('surprise', TRAIN_FOR)),
  scene('hills', 'under the balloon (replays), at 70 px/m', underBalloon),
  scene('forest', 'before the ramp, at 70 px/m', (def) => ({ x: firstX('ramp')(def) - 4, speed: 8, u: 0 })),
  ...RAWS.map((good): SheetEntry => ({ label: `pickup ${good}`, box: rect(-0.4, -0.75, 0.8, 0.82), draw: (ctx, t) => drawPickup(ctx, good, t, 0.3) })),
  ...(['small', 'big'] as const).flatMap((size) =>
    Array.from({ length: BOULDER_HITS[size] }, (_, hits): SheetEntry => ({ label: `boulder ${size}, ${hits} hits`, box: boulderBox, draw: (ctx, t) => drawBoulder(ctx, size, false, hits, (t % 2) + (hits === 0 ? 9 : 0), 'hammer', t) })),
  ),
  ...TOOLS.map((tool): SheetEntry => ({ label: `boulder with a gem, ${tool}`, box: boulderBox, draw: (ctx, t) => drawBoulder(ctx, 'big', true, 3, t % 1.5, tool, t) })),
  { label: 'boulder hit now and again', box: boulderBox, draw: (ctx, t) => drawBoulder(ctx, 'small', true, Math.floor(t / 1.2) % 3, t % 1.2, 'pickaxe', t) },
  ...(['ducks', 'cats', 'hedgehogs', 'cows'] as const).flatMap((who): SheetEntry[] => [
    { label: `${who} waiting`, box: crosserBox, draw: (ctx, t) => drawCrosser(ctx, who, 0, 1e4, t) },
    { label: `${who} crossing (replays)`, box: crossingBox, draw: (ctx, t) => drawCrosser(ctx, who, ((t % (CROSS_FOR + 1)) - 0.5) / CROSS_FOR, 1e4, t) },
    { label: `${who} answering the horn`, box: crosserBox, draw: (ctx, t) => drawCrosser(ctx, who, 0, t % 2.2, t) },
  ]),
  { label: 'ramp', box: rect(-3.4, -1.3, 3.8, 1.6), draw: (ctx, t) => drawRamp(ctx, t) },
  { label: 'present shut', box: rect(-0.6, -1.0, 1.2, 1.1), draw: (ctx, t) => drawPresent(ctx, t, -1) },
  { label: 'present opening (replays)', box: rect(-0.8, -1.7, 1.75, 1.8), draw: (ctx, t) => drawPresent(ctx, t, t % 3) },
  { label: 'train passing (replays)', box: trainBox, draw: (ctx, t) => drawSurprise(ctx, 'train', (t % ((TRAIN_CROSSED + 0.1) * TRAIN_FOR)) / TRAIN_FOR - 0.1, t) },
  { label: 'train leaving, barrier up (replays)', box: leavingBox, draw: (ctx, t) => drawSurprise(ctx, 'train', TRAIN_CROSSED - 0.1 + (t % ((1.2 - TRAIN_CROSSED) * TRAIN_FOR)) / TRAIN_FOR, t) },
  { label: 'barrier down', box: trainBox, draw: (ctx, t) => drawSurprise(ctx, 'train', 0, t) },
  { label: 'balloon coming, dropping, going (replays)', box: balloonBox, draw: (ctx, t) => drawSurprise(ctx, 'balloon', (t % 6) / 5, t) },
  { label: 'balloon dropping its gem', box: rect(-1.5, -7.4, 2.9, 4.45), draw: (ctx, t) => drawSurprise(ctx, 'balloon', 0.49, t) },
  { label: 'home sign', box: rect(-0.7, -2.5, 1.4, 2.6), draw: (ctx, t) => drawHomeSign(ctx, t) },
  ...(['forest', 'beach', 'hills'] as const).map((kind) => at(50, rect(-1.5, -1, 3, 2), `road card ${kind}, at 50 px/m`, (ctx, t) => drawRoadCard(ctx, kind, t))),
  ...(['forest', 'beach', 'hills'] as const).map((kind): SheetEntry => ({ label: `road card ${kind}`, box: rect(-1.5, -1, 3, 2), draw: (ctx, t) => drawRoadCard(ctx, kind, t) })),
]
