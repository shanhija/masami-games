import { FRIENDS } from '../../game/catalog'
import { FLOOR_BAND } from '../../game/layout'
import type { Look } from '../../game/model'
import { POSE_LENGTH, drawRig, mixRig, posed, type Rig } from '../builder'
import {
  BOX,
  C,
  INK,
  MATERIAL_LOOK,
  SKY,
  TAU,
  arch,
  blob,
  box,
  circlePath,
  circlesPath,
  clamp01,
  detail,
  flatSun,
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
  starPath,
  tube,
  type Faces,
} from '../look'
import type { FloorDraw, ItemDraw, ThemeArt, WallDraw } from './types'

/**
 * The play rooms: play, ballpit, slide, gym. Each theme's wallpaper (four colourings), floor band
 * (four colourings), window glow and its five items.
 *
 * Walls and floors are backdrops: no ink, a mid-light value, one big tone-on-tone motif and a
 * border along the bottom, so the inked items in front of them read first. Play: toy shapes
 * over a scalloped border on a puzzle mat. Ball pit: clouds over a row of big balls on a
 * padded floor. Slide: leaves over rolling hills on a dimpled rubber mat. Gym: zigzags over
 * wall pads on a sprung wooden floor with a court line.
 *
 * The items are toys drawn with ink like the block tower, each with one clear funny reaction
 * to a tap that settles within 1.5 s. Children are the builder rig in a fixed friend's outfit
 * (drawRig, their shadow kept on the floor when they leave it), scaled down where a slide or
 * a trampoline lifts them; balls are glossy with one shine tick each.
 */

/** The Play wallpaper's four colourings: the wall, its shapes (a lighter tone of it), the border along the bottom. */
const PLAY_WALLS = [
  { base: '#9ED6F5', shape: '#C3E6F9', border: '#FFE08A' },
  { base: '#A9E2C4', shape: '#CBEFDB', border: '#FFB8A8' },
  { base: '#FFE39A', shape: '#FFF0C6', border: '#9ED6F5' },
  { base: '#CDB9F2', shape: '#E2D6F8', border: '#FFC6DF' },
] as const
/** The puzzle mat's four colourings: two tiles that alternate, and the mat's front edge. */
const PLAY_FLOORS = [
  { a: '#FF9C8A', b: '#9EDDB0', edge: '#E07A6A' },
  { a: '#86C9F0', b: '#A4DE97', edge: '#5FA6D0' },
  { a: '#C9A8F0', b: '#FFB3D1', edge: '#A584D4' },
  { a: '#FFB36B', b: '#82D6C6', edge: '#E08F45' },
] as const
/** The Ball pit wallpaper's four colourings: the wall, its clouds (a lighter tone), the row of big balls along the bottom (a deeper tone). */
const BALLPIT_WALLS = [
  { base: '#E6DDFB', shape: '#F6F2FE', border: '#D3C4F5' },
  { base: '#CBE5FA', shape: '#E7F3FD', border: '#ADD3F3' },
  { base: '#FFD9E6', shape: '#FFEEF4', border: '#FFC0D6' },
  { base: '#FFEDB8', shape: '#FFF7DC', border: '#FFDE85' },
] as const
/** The Ball pit's padded floor: two cushion colours that alternate, and the gaps and front edge between them. */
const BALLPIT_FLOORS = [
  { a: '#FF8FB1', b: '#FFC93A', edge: '#D9658A' },
  { a: '#7FB8FF', b: '#B39BFF', edge: '#5A8FD6' },
  { a: '#6ED3B6', b: '#FFE07A', edge: '#45A98D' },
  { a: '#FFA65C', b: '#FF8FB1', edge: '#D6803A' },
] as const
/** The Slide wallpaper's four colourings: the wall, its leaves (a lighter tone), the rolling hills along the bottom (a deeper tone). */
const SLIDE_WALLS = [
  { base: '#B9EBC4', shape: '#D8F5DF', border: '#9CDDAC' },
  { base: '#B6DFF5', shape: '#D7EEFA', border: '#96CEEE' },
  { base: '#F6E79C', shape: '#FBF3CC', border: '#EFD772' },
  { base: '#D8CCF3', shape: '#EBE4FA', border: '#C2B0EC' },
] as const
/** The Slide's rubber safety mat: the mat, its big round dimples, its front edge. */
const SLIDE_FLOORS = [
  { base: '#6CC27A', dimple: '#8CD497', edge: '#4E9F5C' },
  { base: '#5FA8E0', dimple: '#84BDEA', edge: '#4588BF' },
  { base: '#FF9F5A', dimple: '#FFBA85', edge: '#D97D3A' },
  { base: '#E06C5A', dimple: '#EA8F80', edge: '#BB4F3F' },
] as const
/** The Gym wallpaper's four colourings: the wall, its zigzags (a lighter tone), the padded panels along the bottom (a deeper tone). */
const GYM_WALLS = [
  { base: '#FFCFB0', shape: '#FFE4D2', border: '#FFB68A' },
  { base: '#B9DCF6', shape: '#D8ECFA', border: '#97C9EF' },
  { base: '#D3EDA4', shape: '#E7F6CC', border: '#BADF7E' },
  { base: '#E0D2F6', shape: '#EFE7FB', border: '#CAB6EF' },
] as const
/** The Gym's sprung floor: the boards, the seams between them, the painted court line, the front edge. */
const GYM_FLOORS = [
  { board: '#F2C27A', seam: '#D9A55C', line: '#FF5A5A', edge: '#C98F45' },
  { board: '#F6DCAE', seam: '#E0BE86', line: '#2E6BE6', edge: '#CFA66C' },
  { board: '#5FA6D6', seam: '#4D8FBE', line: '#FFFFFF', edge: '#3F7AA6' },
  { board: '#6CC07A', seam: '#57A866', line: '#FFE680', edge: '#4A9A58' },
] as const
/** The toy blocks' colours, as made things' faces. */
const TOY: Record<'red' | 'yellow' | 'blue' | 'green', Faces> = {
  red: { face: '#FF5A5A', top: '#FF8A80', side: '#D93A3A' },
  yellow: { face: '#FFD93A', top: '#FFE680', side: '#D9A800' },
  blue: BOX.cobalt,
  green: { face: '#4FD36A', top: '#84E394', side: '#2FA84A' },
}
const MARK = '#FFF4DC'
/** The colour each theme's windows glow at Good night: a warm yellow, a soft pink, a sunny lemon, a warm apricot. */
const GLOW = { play: '#FFE08A', ballpit: '#FFCDEB', slide: '#FFF3A6', gym: '#FFD3A8' } as const
/** The five ball colours: red, yellow, blue, green, purple. */
const BALLS = [C.confetti[0], C.confetti[1], C.confetti[3], C.confetti[2], C.confetti[4]] as const

/** The items' own colours beyond look.ts. */
const KIT = {
  // The plane mobile's red biplane with yellow wings and a wooden propeller.
  plane: TOY.red,
  wing: TOY.yellow.face,
  wood: MATERIAL_LOOK.planks,
  // The rocking horse: cream with dapples, an orange mane, a red saddle on a blue blanket, on red rockers.
  horse: '#FFF4DC',
  horseFar: '#E8D9BE',
  dapple: '#EEE2CB',
  mane: '#FF9F3A',
  saddle: '#E8443A',
  blanket: '#2E6BE6',
  // The toy car and the shelf's toy truck.
  car: TOY.red,
  // The cloud lamp, lit.
  lamp: '#FFFBEA',
  // The hoop: its backboard, the target square, the rim, the net and the basketball.
  board: { face: '#FFFFFF', top: '#F2F4F8', side: '#C9CFDA' } satisfies Faces,
  target: '#FF5A5A',
  rim: '#FF7A1F',
  net: '#FFFFFF',
  basketball: '#FF8A3D',
  // The ball pit's padded walls and the yellow rail round its top.
  pit: { face: '#4AA8FF', top: '#7DC0FF', side: '#2E86DB' } satisfies Faces,
  rail: '#FFD93A',
  // The diver's blow-up pool: a red ring on a white one.
  pool: '#FF5A5A',
  poolLow: '#FFFFFF',
  // The ball run's glass tube and its red cap.
  glass: 'rgba(189, 229, 248, 0.3)',
  cap: '#E8443A',
  // The paper plane: white paper, a sky-blue underside, a red stripe.
  paper: '#FFFFFF',
  paperUnder: '#BDE5F8',
  paperStripe: '#FF5A5A',
  // The sunny window: a white frame and a wooden sill, a pot of red flowers.
  frame: { face: '#FFFFFF', top: '#F2F4F8', side: '#C9CFDA' } satisfies Faces,
  pot: '#E0714A',
  petal: '#FF5A5A',
  leaf: BOX.grass.face,
  // The big slide: a yellow chute, a blue platform and ladder, steel legs.
  chute: BOX.yellow,
  ladder: BOX.cobalt.face,
  steel: BOX.steel.face,
  // The landing cushion: coral with yellow piping and a yellow star.
  cushion: '#FF7F6A',
  cushionDark: '#E0604C',
  star: '#FFD93A',
  // The gym rings: blue straps, steel buckles, wooden rings.
  strap: BOX.cobalt.face,
  // The trampoline: a blue pad, a dark mat, a red foam grip.
  pad: BOX.cobalt,
  mat: '#2A3350',
  grip: '#E8443A',
  // The big gym ball: blue with a yellow band.
  gymBall: '#4AA8FF',
  band: '#FFD93A',
} as const

/** The wallpaper motif's grid: a shape every SPACE metres, alternate rows shifted by half. */
const SPACE = { x: 0.72, y: 0.62 }
/** The border's top edge is this far above the wall's bottom; its scallops are this wide. */
const BORDER = { h: 0.5, scallop: 0.24 }

const wall: WallDraw = (ctx, w, h, t, variant) => {
  void t
  const c = PLAY_WALLS[variant]
  ctx.save()
  ctx.fillStyle = c.base
  ctx.fillRect(0, 0, w, h)
  // Big toy shapes, tone on tone: circle, triangle, square, in turn.
  ctx.fillStyle = c.shape
  for (let row = 0; row * SPACE.y < h - BORDER.h + 0.2; row++) {
    const shift = (row % 2) * SPACE.x * 0.5
    for (let col = -1; col * SPACE.x < w + 0.4; col++) {
      const x = 0.36 + col * SPACE.x + shift
      const y = 0.34 + row * SPACE.y
      const kind = (((col + row * 2) % 3) + 3) % 3
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate((((col * 7 + row * 3) % 5) - 2) * 0.12)
      ctx.beginPath()
      if (kind === 0) ctx.arc(0, 0, 0.17, 0, TAU)
      else if (kind === 1) {
        ctx.moveTo(0, -0.19)
        ctx.lineTo(0.19, 0.14)
        ctx.lineTo(-0.19, 0.14)
        ctx.closePath()
      } else ctx.rect(-0.15, -0.15, 0.3, 0.3)
      ctx.fill()
      ctx.restore()
    }
  }
  // The scalloped border along the bottom.
  ctx.beginPath()
  ctx.moveTo(0, h)
  ctx.lineTo(0, h - BORDER.h)
  for (let x = 0; x < w; x += BORDER.scallop) ctx.arc(x + BORDER.scallop / 2, h - BORDER.h, BORDER.scallop / 2, Math.PI, 0, false)
  ctx.lineTo(w, h)
  ctx.closePath()
  ctx.fillStyle = c.border
  ctx.fill()
  ctx.restore()
}

const floor: FloorDraw = (ctx, w, t, variant) => {
  void t
  const c = PLAY_FLOORS[variant]
  const band = 0.2
  const tile = 0.32
  ctx.save()
  ctx.fillStyle = c.a
  ctx.fillRect(0, 0, w, band)
  // Every other tile, its jigsaw nub poking into the next one.
  ctx.fillStyle = c.b
  for (let i = 1; i * tile < w; i += 2) {
    ctx.beginPath()
    ctx.rect(i * tile, 0, tile, band)
    ctx.moveTo(i * tile, band * 0.45)
    ctx.arc(i * tile, band * 0.45, 0.04, 0, TAU)
    ctx.moveTo((i + 1) * tile + 0.04, band * 0.55)
    ctx.arc((i + 1) * tile, band * 0.55, 0.04, 0, TAU)
    ctx.fill()
  }
  ctx.fillStyle = c.edge
  ctx.fillRect(0, band - 0.035, w, 0.035)
  ctx.restore()
}

/** One toy block: its home in the tower and where it lands when the tower falls (centres, metres from the anchor), its size, colour and the shape on its face. */
interface Toy {
  home: readonly [number, number]
  rest: readonly [number, number]
  /** How far it tips (radians) on its way down; it always lands square. */
  tip: number
  w: number
  h: number
  faces: Faces
  kind: 'block' | 'roof' | 'ball'
  sign: 'none' | 'star' | 'heart' | 'dot'
}
const BLOCK_D = 0.06
const TOWER: readonly Toy[] = [
  { home: [0, -0.065], rest: [-0.02, -0.065], tip: 0, w: 0.56, h: 0.13, faces: TOY.red, kind: 'block', sign: 'none' },
  { home: [-0.15, -0.25], rest: [-0.39, -0.12], tip: -1.0, w: 0.24, h: 0.24, faces: TOY.yellow, kind: 'block', sign: 'star' },
  { home: [0.13, -0.25], rest: [0.34, -0.12], tip: 0.7, w: 0.24, h: 0.24, faces: TOY.blue, kind: 'block', sign: 'heart' },
  { home: [-0.01, -0.42], rest: [-0.02, -0.18], tip: 0.3, w: 0.54, h: 0.1, faces: TOY.green, kind: 'block', sign: 'none' },
  { home: [-0.01, -0.6], rest: [-0.06, -0.36], tip: -0.6, w: 0.26, h: 0.26, faces: TOY.red, kind: 'block', sign: 'dot' },
  { home: [-0.01, -0.84], rest: [-0.39, -0.35], tip: -2.2, w: 0.32, h: 0.22, faces: TOY.yellow, kind: 'roof', sign: 'none' },
  { home: [-0.01, -1.01], rest: [0.34, -0.3], tip: 3, w: 0.12, h: 0.12, faces: TOY.blue, kind: 'ball', sign: 'none' },
]

/** One toy centred at the origin, square to the floor. */
function drawToy(ctx: CanvasRenderingContext2D, toy: Toy, fine: boolean) {
  const { w, h, faces } = toy
  if (toy.kind === 'ball') {
    circlePath(ctx, 0, 0, w / 2)
    part(ctx, TOY.red.face, 'line')
    shine(ctx, 0, 0, w / 2)
    return
  }
  if (toy.kind === 'roof') {
    // A triangular prism: its front, and its right slope receding as the lit face.
    ctx.beginPath()
    ctx.moveTo(0, -h / 2)
    ctx.lineTo(BLOCK_D, -h / 2 - BLOCK_D)
    ctx.lineTo(w / 2 + BLOCK_D, h / 2 - BLOCK_D)
    ctx.lineTo(w / 2, h / 2)
    ctx.closePath()
    part(ctx, faces.top, 'line')
    ctx.beginPath()
    ctx.moveTo(-w / 2, h / 2)
    ctx.lineTo(0, -h / 2)
    ctx.lineTo(w / 2, h / 2)
    ctx.closePath()
    part(ctx, faces.face, 'line')
    return
  }
  box(ctx, -w / 2, -h / 2, w, h, faces, BLOCK_D, true, true, 'line')
  if (!fine) return
  const s = Math.min(w, h)
  if (toy.sign === 'star') starPath(ctx, 0, 0.01, s * 0.34)
  else if (toy.sign === 'heart') heartPath(ctx, 0, 0, s * 0.55)
  else if (toy.sign === 'dot') circlePath(ctx, 0, 0, s * 0.24)
  else return
  part(ctx, MARK, 'detail')
}

/**
 * The tower of toy blocks. Idle it stands still; on a tap (play >= 0) it topples, the top
 * blocks first, tipping as they fall and landing square on the floor in a little pile, then
 * hops back together from the bottom up, rebuilt by 1.5 s.
 */
const blockTower: ItemDraw = (ctx, t, play) => {
  void t
  const fine = detail(1.15) !== 'S'
  const n = TOWER.length
  ctx.save()
  ctx.lineJoin = 'round'
  TOWER.forEach((toy, i) => {
    let [x, y] = toy.home
    let rot = 0
    if (play >= 0 && play < 1.6) {
      // Down: the top ones go first, falling faster and faster.
      const fall = clamp01((play - (n - 1 - i) * 0.04) / 0.36)
      // Back up: bottom first, each along a little arc.
      const back = smooth(0, 1, clamp01((play - (0.7 + i * 0.1)) / 0.28))
      const down = fall * fall
      x = mix(mix(toy.home[0], toy.rest[0], smooth(0, 1, fall)), toy.home[0], back)
      y = mix(mix(toy.home[1], toy.rest[1], down), toy.home[1], back) - 0.16 * arch(back)
      rot = toy.tip * Math.sin(Math.PI * fall) * (1 - back) + toy.tip * 0.25 * Math.sin(Math.PI * back)
    }
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(rot)
    drawToy(ctx, toy, fine)
    ctx.restore()
  })
  ctx.restore()
}

// ---------------------------------------------------------------------------------------
// The other three themes' backdrops

/** A cloud of round puffs about one metre wide, as (x, y, r) triples around its middle: the wallpaper's, the cloud lamp's and the sunny window's. */
const CLOUD = [-0.32, 0.06, 0.2, -0.1, -0.08, 0.27, 0.17, -0.04, 0.24, 0.36, 0.08, 0.16, 0.02, 0.1, 0.2] as const
/** The cloud's puffs centred at (x, y), `size` metres wide. */
const cloudAt = (x: number, y: number, size: number) => CLOUD.map((v, i) => (i % 3 === 0 ? x + v * size : i % 3 === 1 ? y + v * size : v * size))

/** A wallpaper motif's grid: every dx by dy metres from (x0, y0), alternate rows shifted by half, down to `bottom`; `draw` gets the point and a tilt that varies from point to point. */
function scatter(w: number, bottom: number, dx: number, dy: number, x0: number, y0: number, draw: (x: number, y: number, tilt: number, n: number) => void) {
  for (let row = 0; y0 + row * dy < bottom; row++) {
    const shift = (row % 2) * dx * 0.5
    for (let col = -1; x0 + col * dx + shift < w + dx; col++) {
      const n = (((col * 7 + row * 3) % 5) + 5) % 5
      draw(x0 + col * dx + shift, y0 + row * dy, (n - 2) * 0.16, n)
    }
  }
}

/** The bottom border's top edge is this far above the wall's bottom (the floor band covers its lowest 0.2 m). */
const BORDER_H = 0.52

const ballpitWall: WallDraw = (ctx, w, h, t, variant) => {
  void t
  const c = BALLPIT_WALLS[variant]
  ctx.save()
  ctx.fillStyle = c.base
  ctx.fillRect(0, 0, w, h)
  const clouds: number[] = []
  scatter(w, h - BORDER_H + 0.25, 1.1, 0.78, 0.46, 0.4, (x, y, tilt) => clouds.push(...cloudAt(x, y, 0.62 + tilt * 0.25)))
  circlesPath(ctx, clouds)
  ctx.fillStyle = c.shape
  ctx.fill()
  // A row of big balls along the bottom, as if the pit's balls were piled against the wall.
  ctx.beginPath()
  for (let i = 0, x = 0.1; x < w + 0.3; i++, x += 0.36) {
    const y = h - BORDER_H + 0.22 + (i % 2) * 0.07
    ctx.moveTo(x + 0.22, y)
    ctx.arc(x, y, 0.22, 0, TAU)
  }
  ctx.rect(0, h - BORDER_H + 0.24, w, BORDER_H)
  ctx.fillStyle = c.border
  ctx.fill()
  ctx.restore()
}

const ballpitFloor: FloorDraw = (ctx, w, t, variant) => {
  void t
  const c = BALLPIT_FLOORS[variant]
  const seg = 0.38
  ctx.save()
  ctx.fillStyle = c.edge
  ctx.fillRect(0, 0, w, FLOOR_BAND)
  for (let i = 0; i * seg < w; i++) {
    roundRectPath(ctx, i * seg + 0.012, 0, seg - 0.024, FLOOR_BAND - 0.04, 0.05)
    ctx.fillStyle = i % 2 === 0 ? c.a : c.b
    ctx.fill()
  }
  ctx.restore()
}

const slideWall: WallDraw = (ctx, w, h, t, variant) => {
  void t
  const c = SLIDE_WALLS[variant]
  ctx.save()
  ctx.fillStyle = c.base
  ctx.fillRect(0, 0, w, h)
  // Big leaves, each with its midrib cut out in the wall's colour.
  scatter(w, h - BORDER_H + 0.25, 0.8, 0.68, 0.36, 0.34, (x, y, tilt) => {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(-0.6 + tilt * 3)
    ctx.beginPath()
    ctx.moveTo(-0.22, 0)
    ctx.bezierCurveTo(-0.12, -0.17, 0.1, -0.17, 0.23, 0)
    ctx.bezierCurveTo(0.1, 0.17, -0.12, 0.17, -0.22, 0)
    ctx.fillStyle = c.shape
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(-0.28, 0)
    ctx.lineTo(0.14, 0)
    ctx.lineWidth = 0.024
    ctx.lineCap = 'round'
    ctx.strokeStyle = c.base
    ctx.stroke()
    ctx.restore()
  })
  // Rolling hills along the bottom.
  const top = h - BORDER_H + 0.06
  ctx.beginPath()
  ctx.moveTo(0, h)
  ctx.lineTo(0, top)
  for (let x = 0, i = 0; x < w; x += 0.6, i++) ctx.quadraticCurveTo(x + 0.3, top + (i % 2 === 0 ? -0.2 : 0.12), x + 0.6, top)
  ctx.lineTo(w + 0.6, h)
  ctx.closePath()
  ctx.fillStyle = c.border
  ctx.fill()
  ctx.restore()
}

const slideFloor: FloorDraw = (ctx, w, t, variant) => {
  void t
  const c = SLIDE_FLOORS[variant]
  ctx.save()
  ctx.fillStyle = c.base
  ctx.fillRect(0, 0, w, FLOOR_BAND)
  ctx.beginPath()
  for (let x = 0.12; x < w + 0.1; x += 0.24) {
    ctx.moveTo(x + 0.05, 0.08)
    ctx.arc(x, 0.08, 0.05, 0, TAU)
  }
  ctx.fillStyle = c.dimple
  ctx.fill()
  ctx.fillStyle = c.edge
  ctx.fillRect(0, FLOOR_BAND - 0.035, w, 0.035)
  ctx.restore()
}

const gymWall: WallDraw = (ctx, w, h, t, variant) => {
  void t
  const c = GYM_WALLS[variant]
  ctx.save()
  ctx.fillStyle = c.base
  ctx.fillRect(0, 0, w, h)
  // Fat zigzags, tipped this way and that.
  ctx.lineWidth = 0.075
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = c.shape
  scatter(w, h - BORDER_H + 0.25, 0.78, 0.62, 0.38, 0.34, (x, y, tilt) => {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(tilt * 1.4)
    ctx.beginPath()
    ctx.moveTo(-0.2, 0.06)
    for (let i = 1; i <= 4; i++) ctx.lineTo(-0.2 + i * 0.1, i % 2 === 1 ? -0.06 : 0.06)
    ctx.stroke()
    ctx.restore()
  })
  // The padded panels along the bottom.
  ctx.fillStyle = c.border
  for (let x = 0.03; x < w; x += 0.54) {
    roundRectPath(ctx, x, h - BORDER_H, 0.48, BORDER_H + 0.1, 0.07)
    ctx.fill()
  }
  ctx.restore()
}

const gymFloor: FloorDraw = (ctx, w, t, variant) => {
  void t
  const c = GYM_FLOORS[variant]
  const row = 0.082
  ctx.save()
  ctx.fillStyle = c.board
  ctx.fillRect(0, 0, w, FLOOR_BAND)
  // Two rows of boards, their ends staggered.
  ctx.fillStyle = c.seam
  ctx.fillRect(0, row, w, 0.012)
  for (let r = 0; r < 2; r++) for (let x = 0.3 + r * 0.32; x < w; x += 0.64) ctx.fillRect(x, r * row, 0.012, row)
  ctx.fillStyle = c.line
  ctx.fillRect(0, 0.03, w, 0.024)
  ctx.fillStyle = c.edge
  ctx.fillRect(0, FLOOR_BAND - 0.035, w, 0.035)
  ctx.restore()
}

// ---------------------------------------------------------------------------------------
// Shared by the items

/** Every item picks its detail level by the floor slot's height, so a room's items drop their fine marks together. */
const ITEM_H = 1.15
const fineNow = () => detail(ITEM_H) !== 'S'

/** Seconds since the tap, or -1 for never: an age that is not a finite number counts as never. */
const ageOf = (play: number) => (play >= 0 && Number.isFinite(play) ? play : -1)

/** A damped swing `p` seconds after a tap, starting `lag` seconds late: 0 before it, starting from 0, `hz` swings a second, still from 1.5 s whatever the lag. */
const kick = (p: number, hz: number, lag: number) => {
  const q = p - lag
  return q < 0 ? 0 : Math.exp(-2.8 * q) * Math.sin(TAU * hz * q) * (1 - smooth(1.1, 1.5, p))
}

/** Grows from nothing and shrinks away again as u runs 0 to 1 (0 outside, and at its very ends, so a speck is never drawn): puffs, sparkles and stars, which never fade. */
const pop = (u: number) => (u <= 0.002 || u >= 0.998 ? 0 : arch(u))

/** A glossy ball of radius r centred at (x, y): a flat colour, inked, one shine tick. */
function ball(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, colour: string) {
  circlePath(ctx, x, y, r)
  part(ctx, colour, 'line')
  shine(ctx, x, y, r)
}
/** A thin string from (x0, y0) to (x1, y1): one ink line at the detail weight. */
function string(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  ink(ctx, 'detail')
}
/** A rod from (x0, y0) to (x1, y1), `w` wide in `colour` over its ink edge (look.ts tube), round at the ends. */
function rod(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, w: number, colour: string) {
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  tube(ctx, w, colour)
}
/** look.ts's ground shadow `w` wide under x on the floor line. */
function shadow(ctx: CanvasRenderingContext2D, x: number, w: number) {
  ctx.save()
  ctx.translate(x, 0)
  groundShadow(ctx, w)
  ctx.restore()
}

/** A friend: the builder rig in `look` (a fixed friend, no hat) with the feet at the origin, scaled by k. Its shadow is the caller's, so it can stay on the floor when the friend leaves it. */
function friend(ctx: CanvasRenderingContext2D, look: Look, rig: Rig, k: number) {
  ctx.save()
  ctx.scale(k, k)
  drawRig(ctx, look, rig)
  ctx.restore()
}
/** The friend's own shadow under a lifted figure: it shrinks as they rise, as the builder's does. */
const liftShadow = (ctx: CanvasRenderingContext2D, x: number, w: number, lift: number) => shadow(ctx, x, w * clamp01(1 - lift * 1.5))

// ---------------------------------------------------------------------------------------
// Play

/** The mobile's bar hangs this far below the ceiling and reaches this far either side. */
const MOBILE = { bar: 0.15, half: 0.34 }

/** The mobile's biplane hanging from its string at the origin: red, with yellow wings, a round window and a propeller turned to `spin`. */
function biplane(ctx: CanvasRenderingContext2D, spin: number, fine: boolean) {
  const { plane, wing, wood } = KIT
  // The tail fin, behind the body.
  ctx.beginPath()
  ctx.moveTo(-0.15, 0.21)
  ctx.lineTo(-0.2, 0.11)
  ctx.lineTo(-0.13, 0.11)
  ctx.lineTo(-0.08, 0.2)
  ctx.closePath()
  part(ctx, plane.side, 'line')
  // The propeller's blade, turning: seen from the side it grows and shrinks.
  const blade = 0.075 * Math.max(0.15, Math.abs(Math.cos(spin)))
  roundRectPath(ctx, 0.165, 0.245 - blade, 0.02, blade * 2, 0.01)
  part(ctx, wood.face, 'line')
  roundRectPath(ctx, -0.17, 0.2, 0.34, 0.09, 0.045)
  part(ctx, plane.face, 'line')
  if (fine) {
    ctx.fillStyle = C.white
    ctx.fillRect(-0.115, 0.203, 0.03, 0.084)
  }
  circlePath(ctx, 0.02, 0.235, 0.024)
  part(ctx, C.glassTint, 'detail')
  // The struts, the top wing (where the string ties on) and the bottom wing across the body.
  string(ctx, -0.04, 0.15, -0.04, 0.2)
  string(ctx, 0.08, 0.15, 0.08, 0.2)
  roundRectPath(ctx, -0.08, 0.115, 0.2, 0.036, 0.018)
  part(ctx, wing, 'line')
  roundRectPath(ctx, -0.08, 0.262, 0.2, 0.036, 0.018)
  part(ctx, wing, 'line')
  circlePath(ctx, 0.178, 0.245, 0.02)
  part(ctx, C.hub, 'detail')
}

/**
 * A mobile over the cot: a wooden bar on a cord, a biplane hanging from its middle, a cloud
 * and a star from its ends. The bar teeters, the things on it swing the other way, the
 * propeller turns. A tap (the renderer spins it round) sets the bar teetering hard and the
 * propeller racing three extra turns.
 */
const planeMobile: ItemDraw = (ctx, t, play) => {
  const p = ageOf(play)
  const fine = fineNow()
  const tilt = 0.07 * Math.sin(TAU * loop(t, 3.2, 0)) + 0.3 * kick(p, 1.1, 0)
  const hang = -0.6 * tilt
  const spin = TAU * (t / 1.4 + (p < 0 ? 0 : 3 * smooth(0, 1.3, p)))
  const ex = Math.cos(tilt) * MOBILE.half
  const ey = Math.sin(tilt) * MOBILE.half
  ctx.save()
  ctx.lineJoin = 'round'
  string(ctx, 0, 0, 0, MOBILE.bar)
  // From each end of the bar: the cloud on the left, the star on the right.
  for (const side of [-1, 1] as const) {
    ctx.save()
    ctx.translate(side * ex, MOBILE.bar + side * ey)
    ctx.rotate(hang)
    string(ctx, 0, 0, 0, side < 0 ? 0.12 : 0.1)
    if (side < 0) blob(ctx, cloudAt(0, 0.18, 0.2), C.cloud, 'detail')
    else {
      starPath(ctx, 0, 0.16, 0.07)
      part(ctx, TOY.yellow.face, 'line')
    }
    ctx.restore()
  }
  rod(ctx, -ex, MOBILE.bar - ey, ex, MOBILE.bar + ey, 0.026, KIT.wood.face)
  ctx.save()
  ctx.translate(0, MOBILE.bar)
  ctx.rotate(hang * 0.5)
  string(ctx, 0, 0, 0.02, 0.12)
  biplane(ctx, spin, fine)
  ctx.restore()
  ctx.restore()
}

/** The shelf's board: its front face's top-left and size, and how far its top recedes. Toys stand on the middle of its top. */
const SHELF = { x: -0.42, y: 0.12, w: 0.8, h: 0.05, d: 0.06 }
const SHELF_TOP = SHELF.y - SHELF.d / 2

/** One of the shelf's toys, drawn standing on the origin, and how it rattles: `tap` is seconds since its turn in the rattle (-1 before). */
type ShelfToy = (ctx: CanvasRenderingContext2D, tap: number, fine: boolean) => void

/** A ring stacker: five rings on a post, biggest at the bottom, a purple knob on top. */
const ringStacker: ShelfToy = (ctx) => {
  rod(ctx, 0, 0, 0, -0.2, 0.024, KIT.wood.face)
  roundRectPath(ctx, -0.09, -0.035, 0.18, 0.035, 0.012)
  part(ctx, KIT.wood.face, 'line')
  ;[0.17, 0.142, 0.116, 0.092, 0.07].forEach((w, i) => {
    roundRectPath(ctx, -w / 2, -0.035 - (i + 1) * 0.044, w, 0.044, 0.022)
    part(ctx, C.rainbow[i]!, 'line')
  })
  ball(ctx, 0, -0.035 - 5 * 0.044 - 0.028, 0.03, C.rainbow[5])
}
/** A pink ball. */
const shelfBall: ShelfToy = (ctx) => ball(ctx, 0, -0.072, 0.072, C.confetti[5])
/** A little yellow dump truck with a red cab, its wheels on the shelf. */
const toyTruck: ShelfToy = (ctx, tap) => {
  const roll = tap < 0 ? 0 : 0.03 * Math.sin(TAU * 2 * tap) * (1 - clamp01(tap / 0.8))
  ctx.translate(roll, 0)
  box(ctx, -0.12, -0.11, 0.14, 0.055, BOX.yellow, 0.03, true, true, 'line')
  box(ctx, 0.02, -0.13, 0.08, 0.075, KIT.car, 0.03, true, true, 'line')
  ctx.fillStyle = C.glassTint
  ctx.fillRect(0.05, -0.12, 0.04, 0.03)
  for (const x of [-0.07, 0.055]) {
    circlePath(ctx, x, -0.032, 0.032)
    part(ctx, C.tyre, 'line')
    circlePath(ctx, x, -0.032, 0.012)
    ctx.fillStyle = C.hub
    ctx.fill()
  }
}
/** A spinning top: red with a yellow band and a handle; on a tap it twirls. */
const spinTop: ShelfToy = (ctx, tap, fine) => {
  const turn = tap < 0 ? 1 : Math.cos(TAU * 2 * smooth(0, 0.9, tap))
  ctx.scale(Math.sign(turn || 1) * Math.max(0.2, Math.abs(turn)), 1)
  rod(ctx, 0, -0.1, 0, -0.15, 0.02, KIT.wood.face)
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.quadraticCurveTo(-0.07, -0.05, -0.065, -0.09)
  ctx.lineTo(0.065, -0.09)
  ctx.quadraticCurveTo(0.07, -0.05, 0, 0)
  ctx.closePath()
  part(ctx, TOY.red.face, 'line')
  if (fine) {
    ctx.fillStyle = TOY.yellow.face
    ctx.fillRect(-0.06, -0.075, 0.12, 0.022)
  }
  roundRectPath(ctx, -0.07, -0.105, 0.14, 0.022, 0.011)
  part(ctx, TOY.blue.face, 'line')
}
/** The shelf's toys left to right: where each stands. */
const SHELF_TOYS: readonly (readonly [number, ShelfToy])[] = [
  [-0.27, ringStacker],
  [-0.08, shelfBall],
  [0.13, toyTruck],
  [0.31, spinTop],
]

/**
 * A wooden shelf on two brackets holding a ring stacker, a ball, a little dump truck and a
 * spinning top. On a tap (the renderer shakes the shelf) the toys rattle: each hops twice
 * and wobbles in turn from left to right, the truck rolls and the top twirls.
 */
const toyShelf: ItemDraw = (ctx, t, play) => {
  void t
  const p = ageOf(play)
  const fine = fineNow()
  ctx.save()
  ctx.lineJoin = 'round'
  for (const bx of [-0.3, 0.2]) {
    ctx.beginPath()
    ctx.moveTo(bx, SHELF.y + SHELF.h)
    ctx.lineTo(bx + 0.11, SHELF.y + SHELF.h)
    ctx.lineTo(bx, SHELF.y + SHELF.h + 0.11)
    ctx.closePath()
    part(ctx, KIT.wood.side, 'line')
  }
  box(ctx, SHELF.x, SHELF.y, SHELF.w, SHELF.h, KIT.wood, SHELF.d, true, true, 'line')
  SHELF_TOYS.forEach(([x, draw], i) => {
    const q = p < 0 ? -1 : p - i * 0.08
    const hop = q < 0 ? 0 : 0.05 * pop(q / 0.24) + 0.022 * pop((q - 0.24) / 0.16)
    const wobble = q < 0 ? 0 : 0.22 * Math.sin(TAU * 2.6 * q) * (1 - clamp01(q / 0.9))
    ctx.save()
    ctx.translate(x + SHELF.d / 2, SHELF_TOP - hop)
    ctx.rotate(wobble)
    draw(ctx, q, fine)
    ctx.restore()
  })
  ctx.restore()
}

/** The toy car pushed by the friend on the floor: a red body, a cabin with a window, two wheels turned to `roll` radians. */
function toyCar(ctx: CanvasRenderingContext2D, roll: number, fine: boolean) {
  roundRectPath(ctx, -0.07, -0.15, 0.1, 0.07, 0.035)
  part(ctx, KIT.car.side, 'line')
  ctx.fillStyle = C.glassTint
  ctx.fillRect(-0.045, -0.135, 0.06, 0.035)
  roundRectPath(ctx, -0.11, -0.1, 0.22, 0.065, 0.03)
  part(ctx, KIT.car.face, 'line')
  for (const x of [-0.065, 0.065]) {
    circlePath(ctx, x, -0.035, 0.035)
    part(ctx, C.tyre, 'line')
    if (fine) {
      ctx.beginPath()
      ctx.moveTo(x, -0.035)
      ctx.lineTo(x + Math.cos(roll) * 0.024, -0.035 + Math.sin(roll) * 0.024)
      ctx.strokeStyle = C.hub
      ctx.lineWidth = lw('detail')
      ctx.stroke()
    }
  }
}

/** The toy kid sits here; their near hand pushes the car along the floor beside their legs, about here. */
const KID_X = -0.26
const CAR_X = 0.04
/** The car's loop-the-loop on a tap: where its foot is (the wheels run round the inside), its radius, and how far the car runs on after it. */
const LOOP = { x: 0.3, r: 0.15, on: 0.1 }

/**
 * A friend sitting on the floor pushing a toy car back and forth beside their legs. A tap and
 * the car zooms off forward, loops the loop in the air, runs on a little and rolls back to
 * their hand, while the friend throws their arms up and giggles.
 */
const toyKid: ItemDraw = (ctx, t, play) => {
  const p = ageOf(play)
  const fine = fineNow()
  // The near hand rides forward and back with the play pose; the car goes with it.
  const home = CAR_X - 0.04 * Math.sin(TAU * loop(t, POSE_LENGTH.play, 0))
  let x = home
  let y = 0
  let turn = 0
  let travel = home - CAR_X
  let zoom = 0
  if (p >= 0 && p < 1.45) {
    const run = LOOP.x - home
    const lap = LOOP.r * TAU
    if (p < 0.25) {
      x = mix(home, LOOP.x, (p / 0.25) ** 2)
      travel = x - CAR_X
    } else if (p < 0.85) {
      const a = Math.PI / 2 - (TAU * (p - 0.25)) / 0.6
      x = LOOP.x + LOOP.r * Math.cos(a)
      y = -LOOP.r + LOOP.r * Math.sin(a)
      turn = a - Math.PI / 2
      travel = run + LOOP.r * (Math.PI / 2 - a)
    } else if (p < 1.05) {
      // Out of the loop it runs on, slowing, then rolls back.
      x = LOOP.x + LOOP.on * (1 - (1 - (p - 0.85) / 0.2) ** 2)
      travel = run + lap + (x - LOOP.x)
    } else {
      x = mix(LOOP.x + LOOP.on, home, smooth(1.05, 1.45, p))
      travel = run + lap + (x - LOOP.x)
    }
    zoom = 1 - smooth(0.2, 0.3, p)
  }
  const giggle = p < 0 ? 0 : smooth(0.05, 0.25, p) * (1 - smooth(1.1, 1.45, p))
  const sitting = posed('play', t)
  const rig: Rig = giggle > 0 ? { ...mixRig(sitting, { ...sitting, lean: -0.05, shoulder: [2.75, 2.45], elbow: [0.3, 0.35] }, giggle), eyes: 'happy', mouth: true } : sitting
  ctx.save()
  ctx.lineJoin = 'round'
  shadow(ctx, KID_X + 0.1, 0.7)
  ctx.save()
  ctx.translate(KID_X, 0)
  friend(ctx, FRIENDS[0]!, rig, 1)
  ctx.restore()
  shadow(ctx, x, 0.22 * clamp01(1 + y * 2.5))
  ctx.translate(x, y)
  ctx.rotate(turn)
  if (zoom > 0) {
    // Speed lines behind the zooming car.
    ctx.beginPath()
    for (const [ly, l] of [
      [-0.11, 0.1],
      [-0.05, 0.15],
    ] as const) {
      ctx.moveTo(-0.14, ly)
      ctx.lineTo(-0.14 - l * zoom, ly)
    }
    ctx.lineCap = 'round'
    ink(ctx, 'detail')
  }
  toyCar(ctx, travel / 0.035, fine)
  ctx.restore()
}

/** The rocking horse's rockers are an arc of this radius, so rocking about its centre keeps them on the floor; they reach this far either side. */
const ROCKER = { r: 0.8, half: 0.38, w: 0.06 }

/**
 * A rocking horse: cream with dapples, an orange mane and tail, a red saddle on a blue
 * blanket, on red rockers. It rocks gently by itself; a tap rocks it hard, the mane and tail
 * flying, and it settles within 1.5 s.
 */
const rockingHorse: ItemDraw = (ctx, t, play) => {
  const p = ageOf(play)
  const fine = fineNow()
  const rock = 0.035 * Math.sin(TAU * loop(t, 2.6, 0)) + 0.12 * kick(p, 1.15, 0)
  const fly = Math.abs(kick(p, 1.15, 0))
  const R = ROCKER.r
  const arcR = R - ROCKER.w / 2
  const a0 = Math.asin(ROCKER.half / arcR)
  const rockerY = (x: number) => -R + Math.sqrt(arcR * arcR - x * x)
  ctx.save()
  ctx.lineJoin = 'round'
  shadow(ctx, 0, 0.8)
  ctx.translate(0, -R)
  ctx.rotate(rock)
  ctx.translate(0, R)
  // The far legs, the tail, the rockers, the near legs, splayed out to the rockers.
  for (const [x0, x1] of [
    [-0.1, -0.22],
    [0.1, 0.24],
  ] as const) rod(ctx, x0 + 0.04, -0.42, x1 + 0.04, rockerY(x1 + 0.04) - 0.02, 0.055, KIT.horseFar)
  blob(ctx, [-0.25, -0.52, 0.05, -0.29 - fly * 0.05, -0.46 - fly * 0.03, 0.046, -0.31 - fly * 0.09, -0.39 - fly * 0.06, 0.04, -0.31 - fly * 0.12, -0.33 - fly * 0.08, 0.03], KIT.mane, 'detail')
  ctx.beginPath()
  for (let i = 0; i <= 12; i++) {
    const a = Math.PI / 2 + a0 * (i / 6 - 1)
    ctx.lineTo(Math.cos(a) * arcR, -R + Math.sin(a) * arcR)
  }
  ctx.lineCap = 'round'
  tube(ctx, ROCKER.w, TOY.red.face)
  for (const [x0, x1] of [
    [-0.14, -0.28],
    [0.07, 0.2],
  ] as const) rod(ctx, x0, -0.42, x1, rockerY(x1) - 0.02, 0.06, KIT.horse)
  // The body, then the head and neck in one shape.
  roundRectPath(ctx, -0.26, -0.57, 0.44, 0.2, 0.1)
  part(ctx, KIT.horse, 'line')
  ctx.beginPath()
  ctx.moveTo(0.04, -0.53)
  ctx.quadraticCurveTo(0.07, -0.74, 0.16, -0.81)
  ctx.quadraticCurveTo(0.24, -0.86, 0.3, -0.8)
  ctx.lineTo(0.37, -0.66)
  ctx.quadraticCurveTo(0.395, -0.59, 0.33, -0.58)
  ctx.quadraticCurveTo(0.26, -0.585, 0.22, -0.64)
  ctx.quadraticCurveTo(0.19, -0.55, 0.17, -0.45)
  ctx.closePath()
  part(ctx, KIT.horse, 'line')
  for (const [x, k] of [
    [0.16, KIT.horseFar],
    [0.2, KIT.horse],
  ] as const) {
    ctx.beginPath()
    ctx.moveTo(x - 0.025, -0.81)
    ctx.lineTo(x + 0.005, -0.91)
    ctx.lineTo(x + 0.04, -0.82)
    ctx.closePath()
    part(ctx, k, 'line')
  }
  if (fine) {
    ctx.beginPath()
    for (const [x, y, r] of [
      [-0.17, -0.44, 0.03],
      [-0.09, -0.41, 0.022],
      [0.08, -0.43, 0.026],
      [0.13, -0.5, 0.018],
    ] as const) {
      ctx.moveTo(x + r, y)
      ctx.arc(x, y, r, 0, TAU)
    }
    ctx.fillStyle = KIT.dapple
    ctx.fill()
    // The bridle round the nose and up behind the cheek.
    ctx.beginPath()
    ctx.moveTo(0.305, -0.585)
    ctx.lineTo(0.355, -0.685)
    ctx.moveTo(0.33, -0.64)
    ctx.lineTo(0.235, -0.73)
    ctx.lineCap = 'round'
    ctx.lineWidth = lw('detail') * 2
    ctx.strokeStyle = KIT.saddle
    ctx.stroke()
  }
  // The mane along the back of the neck, lifted by a hard rock.
  blob(ctx, [0.06, -0.58, 0.045, 0.08 - fly * 0.05, -0.66, 0.046, 0.11 - fly * 0.06, -0.74, 0.042, 0.16 - fly * 0.04, -0.82, 0.034], KIT.mane, 'detail')
  // The saddle cloth hanging down its side, the saddle on it, and the stirrup.
  roundRectPath(ctx, -0.17, -0.585, 0.25, 0.1, 0.03)
  part(ctx, KIT.blanket, 'line')
  ctx.beginPath()
  ctx.moveTo(-0.16, -0.57)
  ctx.quadraticCurveTo(-0.17, -0.66, -0.12, -0.65)
  ctx.quadraticCurveTo(-0.04, -0.6, 0.03, -0.62)
  ctx.quadraticCurveTo(0.09, -0.66, 0.09, -0.57)
  ctx.closePath()
  part(ctx, KIT.saddle, 'line')
  ctx.restore()
}

const play: ThemeArt<'play'> = {
  wall,
  floor,
  glow: GLOW.play,
  swatches: [PLAY_WALLS[0].base, PLAY_WALLS[1].base, PLAY_WALLS[2].base, PLAY_WALLS[3].base],
  items: { planeMobile, toyShelf, blockTower, toyKid, rockingHorse },
}

// ---------------------------------------------------------------------------------------
// Ball pit

/**
 * A cloud lamp on a cord, lit warm, with three raindrops hanging under it that swing by
 * themselves. A tap (the renderer grows it) sets the drops swinging, brightens its glow and
 * pops sparkles round it.
 */
const cloudLamp: ItemDraw = (ctx, t, play) => {
  const p = ageOf(play)
  ctx.save()
  ctx.lineJoin = 'round'
  circlePath(ctx, 0, 0.3, 0.28 * (1 + 0.2 * pop(p / 1.2)))
  ctx.fillStyle = C.light
  ctx.fill()
  rod(ctx, 0, 0, 0, 0.14, 0.014, C.white)
  ;(
    [
      [-0.15, 0.1, C.confetti[3]],
      [0.0, 0.16, C.confetti[5]],
      [0.15, 0.08, C.confetti[4]],
    ] as const
  ).forEach(([x, len, colour], i) => {
    const swing = 0.07 * Math.sin(TAU * loop(t, 1.9, i * 0.31)) + 0.45 * kick(p, 1.3, i * 0.06)
    ctx.save()
    ctx.translate(x, 0.34)
    ctx.rotate(swing)
    const y = len + 0.035
    string(ctx, 0, 0, 0, y - 0.06)
    ctx.beginPath()
    ctx.moveTo(0, y - 0.07)
    ctx.quadraticCurveTo(0.032, y - 0.03, 0.032, y)
    ctx.arc(0, y, 0.032, 0, Math.PI)
    ctx.quadraticCurveTo(-0.032, y - 0.03, 0, y - 0.07)
    ctx.closePath()
    part(ctx, colour, 'line')
    shine(ctx, 0, y, 0.032)
    ctx.restore()
  })
  blob(ctx, cloudAt(0, 0.24, 0.6), KIT.lamp, 'line')
  for (const [x, y, d] of [
    [-0.36, 0.1, 0],
    [0.36, 0.16, 0.12],
    [-0.28, 0.48, 0.24],
    [0.3, 0.5, 0.06],
  ] as const)
    sparkle(ctx, x, y, 0.11 * pop((p - d) / 0.6), C.sparkleWarm)
  ctx.restore()
}

/** The hoop's backboard (front face), its rim (an ellipse across the board's foot) and its net's depth. */
const BOARD = { x: -0.17, y: -0.29, w: 0.52, h: 0.33, d: 0.04 }
const RIM = { x: 0.09, y: 0.06, rx: 0.13, ry: 0.032 }
const NET = 0.19
const BASKETBALL_R = 0.068

/**
 * A basketball hoop on the wall: a white backboard with a red square, an orange rim and a
 * white net. A tap and a basketball arcs in from the left, swishes through the net (which
 * stretches and swings) and drops away, shrinking as it goes.
 */
const hoop: ItemDraw = (ctx, t, play) => {
  void t
  const p = ageOf(play)
  const fine = fineNow()
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  box(ctx, BOARD.x, BOARD.y, BOARD.w, BOARD.h, KIT.board, BOARD.d, true, true, 'line')
  ctx.beginPath()
  ctx.rect(RIM.x - 0.085, -0.13, 0.17, 0.13)
  ctx.lineWidth = 0.018
  ctx.strokeStyle = KIT.target
  ctx.stroke()
  // The ball's flight: in along an arc, down through the rim, out of the net and away.
  let bx = 0
  let by = 0
  let size = 0
  if (p >= 0 && p < 1.1) {
    if (p < 0.55) {
      const u = p / 0.55
      bx = mix(-0.37, RIM.x, u)
      by = mix(0.08, RIM.y - 0.07, u) - 0.3 * arch(u)
    } else {
      bx = RIM.x
      by = mix(RIM.y - 0.07, RIM.y + NET + 0.04, smooth(0.55, 1.05, p))
    }
    size = Math.min(clamp01(p / 0.1), 1 - smooth(0.85, 1.1, p))
  }
  const stretch = p < 0 ? 0 : 0.07 * pop((p - 0.6) / 0.35)
  const sway = 0.03 * kick(p, 2, 0.6)
  // The rim's far half, behind the ball and the net.
  ctx.beginPath()
  ctx.ellipse(RIM.x, RIM.y, RIM.rx, RIM.ry, 0, Math.PI, TAU)
  tube(ctx, 0.022, KIT.rim)
  if (size > 0) {
    const r = BASKETBALL_R * size
    circlePath(ctx, bx, by, r)
    part(ctx, KIT.basketball, 'line')
    if (fine) {
      ctx.beginPath()
      ctx.moveTo(bx - r, by)
      ctx.lineTo(bx + r, by)
      ctx.moveTo(bx - r * 0.3, by - r * 0.95)
      ctx.quadraticCurveTo(bx + r * 0.35, by, bx - r * 0.3, by + r * 0.95)
      ink(ctx, 'detail')
    }
    shine(ctx, bx, by, r)
  }
  // The net: diamonds from the rim down to its narrow foot.
  const top = [-1, -0.5, 0, 0.5, 1].map((k) => [RIM.x + RIM.rx * k, RIM.y] as const)
  const foot = [-1, -0.5, 0, 0.5, 1].map((k) => [RIM.x + sway + 0.075 * k, RIM.y + NET + stretch] as const)
  const mid = [-0.75, -0.25, 0.25, 0.75].map((k) => [RIM.x + sway / 2 + 0.1 * k, RIM.y + (NET + stretch) * 0.5] as const)
  ctx.beginPath()
  ctx.moveTo(top[0]![0], top[0]![1])
  ctx.lineTo(foot[0]![0], foot[0]![1])
  ctx.moveTo(top[4]![0], top[4]![1])
  ctx.lineTo(foot[4]![0], foot[4]![1])
  for (let i = 0; i < 4; i++) {
    ctx.moveTo(top[i]![0], top[i]![1])
    ctx.lineTo(mid[i]![0], mid[i]![1])
    ctx.lineTo(top[i + 1]![0], top[i + 1]![1])
    ctx.moveTo(foot[i]![0], foot[i]![1])
    ctx.lineTo(mid[i]![0], mid[i]![1])
    ctx.lineTo(foot[i + 1]![0], foot[i + 1]![1])
  }
  ctx.moveTo(foot[0]![0], foot[0]![1])
  ctx.lineTo(foot[4]![0], foot[4]![1])
  tube(ctx, 0.012, KIT.net)
  // The bracket and the rim's near half.
  roundRectPath(ctx, RIM.x - 0.03, BOARD.y + BOARD.h - 0.01, 0.06, RIM.y - BOARD.y - BOARD.h + 0.02, 0.01)
  part(ctx, KIT.rim, 'line')
  ctx.beginPath()
  ctx.ellipse(RIM.x, RIM.y, RIM.rx, RIM.ry, 0, 0, Math.PI)
  tube(ctx, 0.022, KIT.rim)
  ctx.restore()
}

/** The pit's ball radius, and its padded walls: the front face's top-left and size, and its depth up-right. */
const PIT_R = 0.068
const PIT = { x: -0.46, y: -0.34, w: 0.84, h: 0.34, d: 0.08 }
/** The pit's balls, back row first: each centre (the heap rises in the middle), its colour and its row. */
const PIT_BALLS = [
  { y: -0.465, x0: -0.33, step: 0.118, n: 7 },
  { y: -0.42, x0: -0.36, step: 0.135, n: 6 },
  { y: -0.375, x0: -0.4, step: 0.135, n: 6 },
].flatMap((row, r) =>
  Array.from({ length: row.n }, (_, i) => {
    const x = row.x0 + i * row.step
    return { x, y: row.y - 0.1 * (1 - (x / 0.5) ** 2), colour: BALLS[(i * 2 + r * 3) % 5]!, row: r }
  }),
)
/** The balls a tap splashes up, by index into PIT_BALLS (middle and front rows), each with its start delay, flight time, height and sideways drift. */
const SPLASH = [
  { i: 8, delay: 0, time: 0.8, h: 0.5, dx: -0.08 },
  { i: 14, delay: 0.03, time: 0.86, h: 0.6, dx: 0.06 },
  { i: 10, delay: 0.05, time: 0.92, h: 0.62, dx: -0.03 },
  { i: 16, delay: 0.08, time: 0.84, h: 0.54, dx: 0.08 },
  { i: 12, delay: 0.1, time: 0.9, h: 0.46, dx: 0.05 },
  { i: 17, delay: 0.13, time: 0.78, h: 0.4, dx: 0.1 },
  { i: 7, delay: 0.15, time: 0.82, h: 0.44, dx: 0.05 },
] as const

/**
 * The ball pit: padded blue walls with a yellow rail, heaped with balls in five colours that
 * jiggle. A tap splashes: a handful of balls fly up and rain back down into their places,
 * the rest hop in a ripple from the middle.
 */
const ballPit: ItemDraw = (ctx, t, play) => {
  const p = ageOf(play)
  const flying = new Map<number, { x: number; y: number }>()
  if (p >= 0)
    for (const s of SPLASH) {
      const u = (p - s.delay) / s.time
      if (u <= 0 || u >= 1) continue
      const home = PIT_BALLS[s.i]!
      flying.set(s.i, { x: home.x + s.dx * Math.sin(Math.PI * u), y: home.y - s.h * arch(u) })
    }
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  shadow(ctx, 0, 0.98)
  // The rail along the back and the left side, behind the balls.
  ctx.beginPath()
  ctx.moveTo(PIT.x, PIT.y)
  ctx.lineTo(PIT.x + PIT.d, PIT.y - PIT.d)
  ctx.lineTo(PIT.x + PIT.w + PIT.d, PIT.y - PIT.d)
  tube(ctx, 0.06, KIT.rail)
  PIT_BALLS.forEach((b, i) => {
    if (flying.has(i)) return
    const jiggle = 0.008 * Math.sin(TAU * loop(t, 1.7, i * 0.37))
    const ripple = p < 0 ? 0 : 0.045 * pop((p - 0.02 - Math.abs(b.x) * 0.5) / 0.32)
    ball(ctx, b.x, b.y - jiggle - ripple, PIT_R, b.colour)
  })
  for (const [i, at] of flying) ball(ctx, at.x, at.y, PIT_R, PIT_BALLS[i]!.colour)
  box(ctx, PIT.x, PIT.y, PIT.w, PIT.h, KIT.pit, PIT.d, false, true, 'line')
  if (fineNow()) {
    ctx.beginPath()
    for (const x of [-0.18, 0.1]) {
      ctx.moveTo(x, PIT.y + 0.06)
      ctx.lineTo(x, -0.04)
    }
    ink(ctx, 'detail')
  }
  // The rail along the front and up the right side.
  ctx.beginPath()
  ctx.moveTo(PIT.x, PIT.y)
  ctx.lineTo(PIT.x + PIT.w, PIT.y)
  ctx.lineTo(PIT.x + PIT.w + PIT.d, PIT.y - PIT.d)
  tube(ctx, 0.06, KIT.rail)
  ctx.restore()
}

/** The diver's little pool of balls: the back row behind them and the front row in front, each heaped in the middle. */
const POOL_BALLS = [
  { y: -0.31, x0: -0.36, n: 7 },
  { y: -0.265, x0: -0.4, n: 7 },
].map((row, r) =>
  Array.from({ length: row.n }, (_, i) => {
    const x = row.x0 + i * 0.128
    return { x, y: row.y - 0.05 * (1 - (x / 0.5) ** 2), colour: BALLS[(i * 3 + r * 2 + 1) % 5]! }
  }),
)
/** The balls a dive throws up: where from (x), how far sideways, how high, and when, as fractions of a splash. */
const DROPS = [
  [-0.08, -0.12, 0.24, 0],
  [0.03, 0.06, 0.32, 0.04],
  [0.12, 0.14, 0.22, 0.08],
  [-0.02, -0.04, 0.36, 0.12],
  [0.08, 0.1, 0.28, 0.02],
] as const
/** When the friend goes in head first, and when they pop up. */
const DIVE_IN = 0.42
const POP_UP = 0.82

/** The balls splashed up `p` seconds after a tap, by the dive going in at x and the pop up at 0: each grows out of the heap, arcs and drops back in. */
function poolSplash(ctx: CanvasRenderingContext2D, p: number, x: number) {
  for (const [at, from] of [
    [DIVE_IN, x],
    [POP_UP, 0],
  ] as const)
    DROPS.forEach(([dx, drift, h, delay], i) => {
      const u = (p - at - delay) / 0.5
      if (u <= 0 || u >= 1) return
      ball(ctx, from + dx + drift * u, -0.3 - h * arch(u), PIT_R * Math.min(1, u * 5), BALLS[(i + (at === DIVE_IN ? 0 : 2)) % 5]!)
    })
}

/**
 * A friend standing waist deep in a blow-up pool of balls. A tap and they crouch, dive in
 * head first (legs kicking in the air), vanish with a splash, and pop up again with their
 * arms up, waving.
 */
const diver: ItemDraw = (ctx, t, play) => {
  const p = ageOf(play)
  const look = FRIENDS[3]!
  const stand = posed('stand', t)
  const crouch = posed('jump', 0.18)
  const dive: Rig = { ...stand, shoulder: [2.95, 2.8], elbow: [0.55, 0.65], thigh: [0.55, 0.65], knee: [1.0, 0.9], eyes: 'happy', mouth: true }
  // Where the figure's middle is (it turns about it), how far it has turned, and its size.
  const MID = 0.57
  const bob = -0.012 * (1 + Math.sin(TAU * loop(t, 2.2, 0)))
  let x = 0
  let y = -MID + bob
  let turn = 0
  let k = 1
  let rig = stand
  if (p >= 0 && p < 1.5) {
    // Upside down, the head just above the floor and the legs up out of the balls.
    const under = 0.03 - MID
    if (p < 0.12) {
      rig = mixRig(stand, crouch, smooth(0, 0.12, p))
    } else if (p < DIVE_IN) {
      const u = (p - 0.12) / (DIVE_IN - 0.12)
      x = 0.14 * smooth(0.35, 1, u)
      y = mix(-MID + bob, under, u) - 0.2 * arch(u)
      turn = 0.95 * Math.PI * smooth(0, 1, u)
      // Lying flat in the air the friend is longer than the slot is wide: they shrink a touch, as if diving away.
      k = 1 - 0.08 * arch(u)
      rig = mixRig(crouch, dive, smooth(0, 0.4, u))
    } else if (p < POP_UP) {
      // Legs kicking in the air, then down into the balls and gone: the friend shrinks away under them, so nothing reaches through the floor.
      const kicks = 0.35 * Math.sin(TAU * 2.6 * (p - DIVE_IN))
      k = mix(1, 0.3, smooth(0.7, POP_UP, p))
      x = 0.14
      y = 0.03 - MID * k
      turn = 0.95 * Math.PI
      rig = { ...dive, thigh: [kicks, -kicks], knee: [0.2, 0.2] }
    } else {
      // Popping up out of the balls, growing back from under them, arms up, then waving.
      const s = smooth(POP_UP, 1.0, p)
      const cheer: Rig = { ...posed('cheer', 0.35), lift: 0 }
      k = mix(0.3, 1, s)
      y = mix(0.06, bob, s) - 0.07 * pop((p - 0.92) / 0.18) - MID * k
      rig = p < 1.0 ? cheer : mixRig(mixRig(cheer, posed('wave', p - 1.0), smooth(1.0, 1.1, p)), stand, smooth(1.25, 1.5, p))
      if (p >= 1.0) rig = { ...rig, eyes: 'happy', mouth: p < 1.4 }
    }
  }
  ctx.save()
  ctx.lineJoin = 'round'
  shadow(ctx, 0, 0.98)
  for (const b of POOL_BALLS[0]!) ball(ctx, b.x, b.y, PIT_R, b.colour)
  ctx.save()
  // Nothing of the friend shows through the floor.
  ctx.beginPath()
  ctx.rect(-0.55, -1.26, 1.1, 1.26)
  ctx.clip()
  ctx.translate(x, y)
  ctx.rotate(turn)
  ctx.translate(0, MID * k)
  friend(ctx, look, rig, k)
  ctx.restore()
  if (p >= 0) poolSplash(ctx, p, 0.14)
  for (const b of POOL_BALLS[1]!) ball(ctx, b.x, b.y, PIT_R, b.colour)
  roundRectPath(ctx, -0.47, -0.13, 0.92, 0.13, 0.065)
  part(ctx, KIT.poolLow, 'line')
  roundRectPath(ctx, -0.47, -0.25, 0.92, 0.13, 0.065)
  part(ctx, KIT.pool, 'line')
  ctx.restore()
}

/** The ball run's ball radius and the path a ball takes, as points: up the glass tube, right along the top ramp, a drop, back left along the lower ramp, into the tube's foot. */
const RUN_R = 0.052
const RUN_PATH = [
  [-0.36, -0.17],
  [-0.36, -0.9],
  [-0.25, -0.885],
  [0.3, -0.665],
  [0.3, -0.53],
  [-0.22, -0.3],
  [-0.36, -0.17],
] as const
/** Each leg of the path's length, and the whole loop's. */
const RUN_LEGS = RUN_PATH.slice(1).map((q, i) => Math.hypot(q[0] - RUN_PATH[i]![0], q[1] - RUN_PATH[i]![1]))
const RUN_LOOP = RUN_LEGS.reduce((a, b) => a + b, 0)
/** Balls on the loop, evenly spaced, and how fast they go idle (metres a second). */
const RUN_BALLS = 7
const RUN_SPEED = 0.16
/** The point `s` metres along the loop. */
function runAt(s: number): readonly [number, number] {
  let d = ((s % RUN_LOOP) + RUN_LOOP) % RUN_LOOP
  for (let i = 0; i < RUN_LEGS.length; i++) {
    const leg = RUN_LEGS[i]!
    if (d <= leg) {
      const a = RUN_PATH[i]!
      const b = RUN_PATH[i + 1]!
      return [mix(a[0], b[0], d / leg), mix(a[1], b[1], d / leg)]
    }
    d -= leg
  }
  return RUN_PATH[0]!
}
/** A ramp under the ball path from (x0, y0) to (x1, y1) (ball centres): a sloped strip with its lit top, the low end open and a stop at the high end. */
function ramp(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, faces: Faces) {
  const off = RUN_R + 0.004
  const th = 0.05
  const d = 0.04
  ctx.beginPath()
  ctx.moveTo(x0, y0 + off)
  ctx.lineTo(x0 + d, y0 + off - d)
  ctx.lineTo(x1 + d, y1 + off - d)
  ctx.lineTo(x1, y1 + off)
  ctx.closePath()
  part(ctx, faces.top, 'line')
  ctx.beginPath()
  ctx.moveTo(x0, y0 + off)
  ctx.lineTo(x1, y1 + off)
  ctx.lineTo(x1, y1 + off + th)
  ctx.lineTo(x0, y0 + off + th)
  ctx.closePath()
  part(ctx, faces.face, 'line')
}

/**
 * A ball run: balls ride up a glass tube, roll right along the top ramp, drop to the lower
 * one and roll back into the tube's foot, round and round. A tap sends them racing once round
 * the whole loop (so each ball ends where it would have been), then back to their stroll.
 */
const ballChute: ItemDraw = (ctx, t, play) => {
  const p = ageOf(play)
  const spacing = RUN_LOOP / RUN_BALLS
  const s0 = RUN_SPEED * t + (p < 0 ? 0 : RUN_LOOP * smooth(0, 1.5, p))
  const wood = KIT.wood
  ctx.save()
  ctx.lineJoin = 'round'
  shadow(ctx, 0, 0.94)
  // The post holding up the ramps' right ends (the top one on a peg), and the base.
  box(ctx, 0.34, -0.74, 0.06, 0.68, wood, 0.03, true, true, 'line')
  box(ctx, -0.47, -0.07, 0.88, 0.07, wood, 0.04, true, true, 'line')
  rod(ctx, 0.24, -0.6, 0.36, -0.6, 0.026, wood.side)
  ramp(ctx, -0.27, -0.893, 0.25, -0.685, TOY.red)
  ramp(ctx, 0.39, -0.57, -0.24, -0.291, TOY.yellow)
  ctx.beginPath()
  ctx.rect(-0.42, -0.95, 0.12, 0.88)
  ctx.fillStyle = C.white
  ctx.fill()
  for (let i = 0; i < RUN_BALLS; i++) {
    const [x, y] = runAt(s0 + i * spacing)
    ball(ctx, x, y, RUN_R, BALLS[i % 5]!)
  }
  // The glass over the balls in the tube, its glints, and the cap.
  ctx.beginPath()
  ctx.rect(-0.42, -0.95, 0.12, 0.88)
  ctx.fillStyle = KIT.glass
  ctx.fill()
  ink(ctx, 'line')
  if (fineNow()) {
    ctx.beginPath()
    ctx.moveTo(-0.405, -0.6)
    ctx.lineTo(-0.405, -0.78)
    ctx.moveTo(-0.405, -0.52)
    ctx.lineTo(-0.405, -0.56)
    ctx.lineCap = 'round'
    ctx.lineWidth = lw('detail') * 1.4
    ctx.strokeStyle = C.white
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.arc(-0.36, -0.95, 0.075, Math.PI, TAU)
  ctx.closePath()
  part(ctx, KIT.cap, 'line')
  ball(ctx, -0.36, -1.04, 0.024, KIT.cap)
  ctx.restore()
}

const ballpit: ThemeArt<'ballpit'> = {
  wall: ballpitWall,
  floor: ballpitFloor,
  glow: GLOW.ballpit,
  swatches: [BALLPIT_WALLS[0].base, BALLPIT_WALLS[1].base, BALLPIT_WALLS[2].base, BALLPIT_WALLS[3].base],
  items: { cloudLamp, hoop, ballPit, diver, ballChute },
}

// ---------------------------------------------------------------------------------------
// Slide

/**
 * A paper plane hanging on a string, gliding: its nose dips and lifts. A tap (the renderer
 * spins it round) and it swoops nose up and back with speed lines behind it.
 */
const paperPlane: ItemDraw = (ctx, t, play) => {
  const p = ageOf(play)
  const pitch = 0.07 * Math.sin(TAU * loop(t, 2.8, 0)) - 0.4 * kick(p, 0.9, 0)
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  string(ctx, 0, 0, 0, 0.3)
  ctx.translate(0, 0.36)
  ctx.rotate(pitch)
  if (p >= 0 && p < 0.7) {
    ctx.beginPath()
    for (const [y, l] of [
      [-0.04, 0.12],
      [0.03, 0.18],
      [0.09, 0.1],
    ] as const) {
      ctx.moveTo(-0.34, y)
      ctx.lineTo(-0.34 - l * pop(p / 0.7) * 0.6, y)
    }
    ink(ctx, 'detail')
  }
  // The underside (the keel) below, then the near wing over it, then the fold.
  ctx.beginPath()
  ctx.moveTo(0.3, 0)
  ctx.lineTo(-0.14, 0.035)
  ctx.lineTo(-0.22, 0.14)
  ctx.closePath()
  part(ctx, KIT.paperUnder, 'line')
  ctx.beginPath()
  ctx.moveTo(0.3, 0)
  ctx.lineTo(-0.3, -0.13)
  ctx.lineTo(-0.14, 0.035)
  ctx.closePath()
  part(ctx, KIT.paper, 'line')
  if (fineNow()) {
    ctx.beginPath()
    ctx.moveTo(0.12, -0.03)
    ctx.lineTo(-0.23, -0.1)
    ctx.lineWidth = 0.016
    ctx.strokeStyle = KIT.paperStripe
    ctx.stroke()
  }
  ctx.restore()
}

/** The sunny window: its frame's front face and depth, and the glass inside it. */
const FRAME = { x: -0.38, y: -0.26, w: 0.72, h: 0.46, d: 0.04 }
const GLASS = { x: -0.33, y: -0.21, w: 0.62, h: 0.36 }
/** The window's cross bars cross here; the sun sits in the top-right pane. */
const BARS = { x: -0.02, y: -0.035, w: 0.032 }
const SUN = { x: 0.15, y: -0.12, r: 0.042 }

/**
 * A sunny window: blue sky, a green hill, a cloud drifting past, a sun whose rays turn slowly,
 * a white frame on a wooden sill with a pot of red flowers. A tap and the sun beams out, its
 * rays turn a quarter and a rainbow rises over the hill and sinks away.
 */
const sunWindow: ItemDraw = (ctx, t, play) => {
  const p = ageOf(play)
  const fine = fineNow()
  ctx.save()
  ctx.lineJoin = 'round'
  box(ctx, FRAME.x, FRAME.y, FRAME.w, FRAME.h, KIT.frame, FRAME.d, true, true, 'line')
  ctx.save()
  ctx.beginPath()
  ctx.rect(GLASS.x, GLASS.y, GLASS.w, GLASS.h)
  ctx.clip()
  ctx.fillStyle = SKY.day.bands[1]
  ctx.fill()
  // The rainbow rising behind the hill on a tap.
  const bow = p < 0 ? 0 : pop(p / 1.5) ** 0.5
  if (bow > 0) {
    C.rainbow.forEach((colour, i) => {
      ctx.beginPath()
      ctx.arc(-0.06, 0.16, (0.25 - i * 0.02) * bow, Math.PI, TAU)
      ctx.lineWidth = 0.02 * bow
      ctx.strokeStyle = colour
      ctx.stroke()
    })
  }
  // A cloud drifting slowly across and back.
  circlesPath(ctx, cloudAt(mix(GLASS.x + 0.04, GLASS.x + GLASS.w - 0.06, 0.5 - 0.5 * Math.cos(TAU * loop(t, 30, 0.2))), -0.15, 0.17))
  ctx.fillStyle = C.cloud
  ctx.fill()
  const beam = 1 + 0.35 * pop(p / 0.9)
  // The rays look the same every quarter turn, so the turn is kept within one.
  const turn = (TAU * (t / 24 + (p < 0 ? 0 : smooth(0, 0.8, p) / 4))) % (TAU / 4)
  ctx.beginPath()
  for (let i = 0; i < 8; i++) {
    const a = turn + (i * TAU) / 8
    const r0 = SUN.r * 1.25 * beam
    const r1 = SUN.r * (i % 2 === 0 ? 1.95 : 1.65) * beam
    ctx.moveTo(SUN.x + Math.cos(a - 0.2) * r0, SUN.y + Math.sin(a - 0.2) * r0)
    ctx.lineTo(SUN.x + Math.cos(a) * r1, SUN.y + Math.sin(a) * r1)
    ctx.lineTo(SUN.x + Math.cos(a + 0.2) * r0, SUN.y + Math.sin(a + 0.2) * r0)
  }
  ctx.fillStyle = SKY.day.sun
  ctx.fill()
  flatSun(ctx, SUN.x, SUN.y, SUN.r * beam, SKY.day.sun, SKY.day.halo)
  // Two green hills, the far one lighter.
  const foot = GLASS.y + GLASS.h
  for (const [x0, x1, top, colour] of [
    [GLASS.x, 0.14, 0.05, BOX.grass.top],
    [-0.06, GLASS.x + GLASS.w, 0.08, BOX.grass.face],
  ] as const) {
    ctx.beginPath()
    ctx.moveTo(x0, foot)
    ctx.bezierCurveTo(x0 + (x1 - x0) * 0.2, top, x0 + (x1 - x0) * 0.8, top, x1, foot)
    ctx.closePath()
    ctx.fillStyle = colour
    ctx.fill()
  }
  if (fine) {
    ctx.beginPath()
    ctx.moveTo(-0.3, -0.08)
    ctx.lineTo(-0.22, -0.17)
    ctx.moveTo(-0.27, -0.06)
    ctx.lineTo(-0.23, -0.105)
    ctx.lineCap = 'round'
    ctx.lineWidth = lw('detail') * 1.5
    ctx.strokeStyle = MATERIAL_LOOK.glass.mark
    ctx.stroke()
  }
  ctx.restore()
  ctx.beginPath()
  ctx.rect(GLASS.x, GLASS.y, GLASS.w, GLASS.h)
  ink(ctx, 'line')
  // The cross bars, then the sill.
  ctx.beginPath()
  ctx.rect(BARS.x - BARS.w / 2, GLASS.y, BARS.w, GLASS.h)
  ctx.rect(GLASS.x, BARS.y - BARS.w / 2, GLASS.w, BARS.w)
  ctx.fillStyle = KIT.frame.face
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(BARS.x - BARS.w / 2, GLASS.y)
  ctx.lineTo(BARS.x - BARS.w / 2, BARS.y - BARS.w / 2)
  ctx.lineTo(GLASS.x, BARS.y - BARS.w / 2)
  ctx.moveTo(GLASS.x, BARS.y + BARS.w / 2)
  ctx.lineTo(BARS.x - BARS.w / 2, BARS.y + BARS.w / 2)
  ctx.lineTo(BARS.x - BARS.w / 2, GLASS.y + GLASS.h)
  ctx.moveTo(BARS.x + BARS.w / 2, GLASS.y + GLASS.h)
  ctx.lineTo(BARS.x + BARS.w / 2, BARS.y + BARS.w / 2)
  ctx.lineTo(GLASS.x + GLASS.w, BARS.y + BARS.w / 2)
  ctx.moveTo(GLASS.x + GLASS.w, BARS.y - BARS.w / 2)
  ctx.lineTo(BARS.x + BARS.w / 2, BARS.y - BARS.w / 2)
  ctx.lineTo(BARS.x + BARS.w / 2, GLASS.y)
  ink(ctx, 'detail')
  box(ctx, FRAME.x - 0.04, FRAME.y + FRAME.h, FRAME.w + 0.08, 0.045, KIT.wood, 0.04, true, true, 'line')
  // The flower pot on the sill: two red flowers on stalks, nodding with the sun's beam.
  const potX = 0.23
  const sillTop = FRAME.y + FRAME.h - 0.02
  for (const [dx, h] of [
    [-0.03, 0.15],
    [0.035, 0.11],
  ] as const) {
    const fx = potX + dx + 0.01 * Math.sin(TAU * loop(t, 2.6, dx))
    const fy = sillTop - 0.05 - h * beam
    rod(ctx, potX + dx * 0.5, sillTop - 0.05, fx, fy, 0.012, KIT.leaf)
    ctx.beginPath()
    for (let i = 0; i < 5; i++) {
      const a = (i * TAU) / 5 - Math.PI / 2
      const px = fx + Math.cos(a) * 0.022
      const py = fy + Math.sin(a) * 0.022
      ctx.moveTo(px + 0.018, py)
      ctx.arc(px, py, 0.018, 0, TAU)
    }
    part(ctx, KIT.petal, 'detail')
    circlePath(ctx, fx, fy, 0.012)
    part(ctx, TOY.yellow.face, 'detail')
  }
  ctx.beginPath()
  ctx.moveTo(potX - 0.055, sillTop - 0.07)
  ctx.lineTo(potX + 0.055, sillTop - 0.07)
  ctx.lineTo(potX + 0.04, sillTop)
  ctx.lineTo(potX - 0.04, sillTop)
  ctx.closePath()
  part(ctx, KIT.pot, 'line')
  ctx.restore()
}

/** The big slide's chute: a curve from the platform down to the floor, as a cubic's four points. */
const CHUTE = [-0.1, -0.5, 0.12, -0.5, 0.14, -0.07, 0.42, -0.07] as const
/** A point on the chute at u (0 the top, 1 the foot) and the slope's angle there. */
function chuteAt(u: number) {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = CHUTE
  const v = 1 - u
  const x = v * v * v * x0 + 3 * v * v * u * x1 + 3 * v * u * u * x2 + u * u * u * x3
  const y = v * v * v * y0 + 3 * v * v * u * y1 + 3 * v * u * u * y2 + u * u * u * y3
  const dx = 3 * v * v * (x1 - x0) + 6 * v * u * (x2 - x1) + 3 * u * u * (x3 - x2)
  const dy = 3 * v * v * (y1 - y0) + 6 * v * u * (y2 - y1) + 3 * u * u * (y3 - y2)
  return { x, y, a: Math.atan2(dy, dx) }
}
/** The slide's rider is the rig at this scale, so they fit on the platform; they sit at the top here. */
const RIDER = 0.66
const TOP_SEAT = { x: -0.24, y: -0.525 }
/** The rider's round, in seconds from sitting at the top: off down the chute, hop up at the foot, walk back, climb, sit again. The ride stops `stop` of the way down the chute, where the rider's feet still stay inside the slot box. */
const RIDE = { go: 0.8, foot: 1.8, walk: 2.3, climb: 3.6, top: 5.0, round: 5.4, stop: 0.78 }
/** The ladder: its foot and top (near rail), the far rail's offset, and its rungs' heights. */
const LADDER = { x0: -0.44, x1: -0.32, y1: -0.56, gap: 0.075 }
const climbRig = (u: number): Rig => {
  const s = Math.sin(TAU * u)
  return { ...posed('walk', u * 0.5), lean: 0.12, thigh: [0.55 + 0.4 * s, 0.55 - 0.4 * s], knee: [0.9, 0.9], shoulder: [2.6 - 0.35 * s, 2.6 + 0.35 * s], elbow: [0.3, 0.3] }
}

/**
 * The big slide: a blue ladder up to a platform, a yellow chute curving down to the floor,
 * and a friend going round: sit at the top, whee down the chute, hop up at the foot, walk
 * back, climb the ladder. A tap sends them down the chute from the top right now.
 */
const bigSlide: ItemDraw = (ctx, t, play) => {
  const p = ageOf(play)
  const fine = fineNow()
  const look = FRIENDS[5]!
  const c = (p < 0 ? t : RIDE.go + p) % RIDE.round
  // Where the rider is, how they are turned, which way they face and their rig.
  let x = TOP_SEAT.x
  let y = TOP_SEAT.y
  let turn = 0
  let face = 1
  let rig: Rig = { ...posed('sit', t), lean: 0.08 }
  let lift = 0
  if (c >= RIDE.go && c < RIDE.foot) {
    const u = smooth(RIDE.go, RIDE.foot, c) ** 1.3
    const at = chuteAt(u * RIDE.stop)
    const lead = clamp01(u / 0.08)
    x = mix(TOP_SEAT.x, at.x - 0.03, lead)
    y = mix(TOP_SEAT.y, at.y - 0.02, lead)
    // Leaning back as they whee down, the rider tips only part way with the chute, which keeps their arms in the slot box.
    turn = at.a * lead * 0.6
    rig = posed('slide', c)
  } else if (c >= RIDE.foot && c < RIDE.walk) {
    const at = chuteAt(RIDE.stop)
    const u = smooth(RIDE.foot, RIDE.foot + 0.25, c)
    x = mix(at.x - 0.03, 0.2, u)
    y = mix(at.y - 0.02, 0, u)
    rig = mixRig(posed('slide', c), posed('hop', c - RIDE.foot - 0.1), u)
    lift = -rig.lift
  } else if (c >= RIDE.walk && c < RIDE.climb) {
    x = mix(0.2, LADDER.x0 + 0.06, smooth(RIDE.walk, RIDE.climb, c))
    y = 0
    face = -1
    rig = posed('walk', c)
  } else if (c >= RIDE.climb && c < RIDE.top) {
    const u = (c - RIDE.climb) / (RIDE.top - RIDE.climb)
    // Up a rung at a time.
    const steps = 4
    const k = (Math.floor(u * steps) + smooth(0.3, 1, (u * steps) % 1)) / steps
    x = mix(LADDER.x0 + 0.06, LADDER.x1 + 0.04, k)
    y = mix(0, LADDER.y1 + 0.02, k)
    rig = climbRig(u * steps * 0.5)
  } else if (c >= RIDE.top) {
    const u = smooth(RIDE.top, RIDE.round, c)
    x = mix(LADDER.x1 + 0.04, TOP_SEAT.x, u)
    y = mix(LADDER.y1 + 0.02, TOP_SEAT.y, u)
    rig = mixRig(climbRig(1), { ...posed('sit', t), lean: 0.08 }, u)
  }
  ctx.save()
  ctx.lineJoin = 'round'
  shadow(ctx, -0.04, 0.96)
  // The legs under the platform and the chute.
  for (const lx of [-0.3, -0.13]) rod(ctx, lx, -0.47, lx, -0.01, 0.03, KIT.steel)
  rod(ctx, 0.36, -0.06, 0.36, -0.01, 0.03, KIT.steel)
  rod(ctx, 0.09, -0.3, 0.09, -0.01, 0.03, KIT.steel)
  // The ladder: the far rail, the rungs, the near rail.
  rod(ctx, LADDER.x0 + LADDER.gap, 0, LADDER.x1 + LADDER.gap, LADDER.y1 - 0.05, 0.032, BOX.cobalt.side)
  for (let i = 1; i <= 4; i++) {
    const k = i / 4.6
    const rx = mix(LADDER.x0, LADDER.x1, k)
    rod(ctx, rx, LADDER.y1 * k, rx + LADDER.gap, LADDER.y1 * k, 0.022, KIT.ladder)
  }
  rod(ctx, LADDER.x0, 0, LADDER.x1, LADDER.y1 - 0.05, 0.032, KIT.ladder)
  box(ctx, -0.36, -0.5, 0.27, 0.05, BOX.cobalt, 0.05, true, true, 'line')
  // The chute: its bed, then its lit edge.
  ctx.beginPath()
  ctx.moveTo(CHUTE[0], CHUTE[1])
  ctx.bezierCurveTo(CHUTE[2], CHUTE[3], CHUTE[4], CHUTE[5], CHUTE[6], CHUTE[7])
  ctx.lineCap = 'round'
  tube(ctx, 0.07, KIT.chute.face)
  if (fine) {
    ctx.save()
    ctx.translate(0, -0.022)
    ctx.beginPath()
    ctx.moveTo(CHUTE[0] + 0.03, CHUTE[1])
    ctx.bezierCurveTo(CHUTE[2], CHUTE[3], CHUTE[4], CHUTE[5], CHUTE[6] - 0.02, CHUTE[7])
    ctx.lineWidth = 0.016
    ctx.strokeStyle = KIT.chute.top
    ctx.stroke()
    ctx.restore()
  }
  // The rider, last: on the chute, on the ladder and walking past in front.
  if (y > -0.05) shadow(ctx, x, 0.36 * clamp01(1 - lift * 2))
  ctx.translate(x, y)
  ctx.rotate(turn)
  ctx.scale(face, 1)
  friend(ctx, look, rig, RIDER)
  ctx.restore()
}

/** A friend's little burst of joy: two hearts that grow and shrink away by their head, `p` seconds after a tap, from `at` for `long`. */
function hearts(ctx: CanvasRenderingContext2D, p: number, at: number, long: number) {
  for (const [x, y, d] of [
    [0.26, -1.0, 0],
    [-0.27, -0.92, 0.15],
  ] as const) {
    const s = pop((p - at - d) / long)
    if (s <= 0) continue
    heartPath(ctx, x, y - 0.06 * s, 0.11 * s)
    part(ctx, C.heart, 'detail')
  }
}

/**
 * A friend at the foot of the slide, waving. A tap and they hop and twirl round, then throw
 * their arms up in a cheer with two hearts, and go back to waving.
 */
const slideKid: ItemDraw = (ctx, t, play) => {
  const p = ageOf(play)
  const wave = posed('wave', t)
  let rig = wave
  let twirl = 1
  if (p >= 0 && p < 1.5) {
    if (p < 0.5) {
      rig = posed('hop', p)
      twirl = Math.cos(TAU * smooth(0.05, 0.45, p))
    } else rig = mixRig(posed('cheer', p - 0.5), wave, smooth(1.2, 1.5, p))
  }
  ctx.save()
  ctx.lineJoin = 'round'
  liftShadow(ctx, 0, 0.5, -rig.lift)
  ctx.save()
  ctx.scale(Math.sign(twirl || 1) * Math.max(0.08, Math.abs(twirl)), 1)
  friend(ctx, FRIENDS[2]!, rig, 1)
  ctx.restore()
  if (p >= 0) hearts(ctx, p, 0.55, 0.8)
  ctx.restore()
}

/** The cushion's size, its corners' roundness and how far its sides bulge. */
const CUSHION = { w: 0.86, h: 0.34, r: 0.11, bulge: 0.05 }
/** The cushion's outline standing on the origin: puffed sides and top, a flat bottom. */
function cushionPath(ctx: CanvasRenderingContext2D) {
  const { w, h, r, bulge } = CUSHION
  const x0 = -w / 2
  const x1 = w / 2
  ctx.beginPath()
  ctx.moveTo(x0 + r, -h)
  ctx.quadraticCurveTo(0, -h - bulge, x1 - r, -h)
  ctx.quadraticCurveTo(x1, -h, x1, -h + r)
  ctx.quadraticCurveTo(x1 + bulge * 0.6, -h / 2, x1, -r * 0.4)
  ctx.quadraticCurveTo(x1, 0, x1 - r, 0)
  ctx.lineTo(x0 + r, 0)
  ctx.quadraticCurveTo(x0, 0, x0, -r * 0.4)
  ctx.quadraticCurveTo(x0 - bulge * 0.6, -h / 2, x0, -h + r)
  ctx.quadraticCurveTo(x0, -h, x0 + r, -h)
  ctx.closePath()
}

/**
 * A big landing cushion, coral with a yellow star, that breathes softly. A tap and it
 * squashes flat, springs up off the floor with a boing, wobbles back to its shape and pops
 * three stars out of its top.
 */
const cushion: ItemDraw = (ctx, t, play) => {
  const p = ageOf(play)
  const fine = fineNow()
  const spring = kick(p, 1.5, 0)
  const sy = 1 + 0.015 * Math.sin(TAU * loop(t, 2.4, 0)) - 0.32 * spring
  const up = p < 0 ? 0 : 0.11 * pop((p - 0.33) / 0.32)
  ctx.save()
  ctx.lineJoin = 'round'
  shadow(ctx, 0, 0.92 * clamp01(1 - up * 2))
  for (const [x, d] of [
    [-0.24, 0.1],
    [0.02, 0.18],
    [0.26, 0.14],
  ] as const) {
    const u = (p - d) / 0.85
    if (p < 0 || u <= 0 || u >= 1) continue
    starPath(ctx, x * (1 + 0.5 * u), -CUSHION.h - 0.05 - 0.55 * Math.sin((Math.PI / 2) * u), 0.07 * pop(u))
    part(ctx, KIT.star, 'detail')
  }
  ctx.translate(0, -up)
  ctx.scale(1 / Math.sqrt(sy), sy)
  cushionPath(ctx)
  part(ctx, KIT.cushion, 'line')
  // The piping round its top face and the star on its front.
  ctx.beginPath()
  ctx.moveTo(-CUSHION.w / 2 + CUSHION.r * 0.7, -CUSHION.h + 0.035)
  ctx.quadraticCurveTo(0, -CUSHION.h - CUSHION.bulge + 0.035, CUSHION.w / 2 - CUSHION.r * 0.7, -CUSHION.h + 0.035)
  ctx.lineCap = 'round'
  ctx.lineWidth = 0.022
  ctx.strokeStyle = KIT.star
  ctx.stroke()
  starPath(ctx, 0, -0.15, 0.09)
  part(ctx, KIT.star, 'detail')
  if (fine) {
    ctx.beginPath()
    for (const x of [-0.27, 0.27]) {
      ctx.moveTo(x + 0.016, -0.15)
      ctx.arc(x, -0.15, 0.016, 0, TAU)
    }
    ctx.fillStyle = KIT.cushionDark
    ctx.fill()
  }
  ctx.restore()
}

const slide: ThemeArt<'slide'> = {
  wall: slideWall,
  floor: slideFloor,
  glow: GLOW.slide,
  swatches: [SLIDE_WALLS[0].base, SLIDE_WALLS[1].base, SLIDE_WALLS[2].base, SLIDE_WALLS[3].base],
  items: { paperPlane, sunWindow, bigSlide, slideKid, cushion },
}

// ---------------------------------------------------------------------------------------
// Gym

/** The rings' straps hang from the ceiling bar this far either side of the anchor. */
const RINGS = { x: 0.16, strap: 0.32, r: 0.085, w: 0.034 }

/**
 * Gym rings: a steel bar on the ceiling, two blue straps with buckles, two wooden rings that
 * sway a little out of step. A tap swings them high, the right one a beat behind, settling
 * within 1.5 s.
 */
const rings: ItemDraw = (ctx, t, play) => {
  const p = ageOf(play)
  ctx.save()
  ctx.lineJoin = 'round'
  for (const side of [-1, 1] as const) {
    const lag = side > 0 ? 0.08 : 0
    const swing = 0.04 * Math.sin(TAU * loop(t, 2.3, side * 0.12)) + 0.34 * kick(p, 0.95, lag)
    ctx.save()
    ctx.translate(side * RINGS.x, 0.03)
    ctx.rotate(swing)
    rod(ctx, 0, 0, 0, RINGS.strap + 0.05, 0.03, KIT.strap)
    roundRectPath(ctx, -0.028, RINGS.strap - 0.06, 0.056, 0.04, 0.008)
    part(ctx, KIT.steel, 'detail')
    ctx.beginPath()
    ctx.arc(0, RINGS.strap + 0.05 + RINGS.r, RINGS.r, 0, TAU)
    tube(ctx, RINGS.w, KIT.wood.face)
    ctx.restore()
  }
  box(ctx, -0.25, 0, 0.5, 0.035, BOX.steel, 0.02, false, true, 'line')
  ctx.restore()
}

/** The climbing wall's holds: centre, colour and the puffs that make its lumpy shape (offsets from the centre). */
const HOLDS = [
  [-0.27, 0.15, C.rainbow[0], [0, 0, 0.045, 0.04, -0.015, 0.035]],
  [-0.08, 0.17, C.rainbow[2], [0, 0, 0.042, -0.03, 0.01, 0.03]],
  [0.15, 0.12, C.rainbow[4], [0, 0, 0.04, 0.04, 0.005, 0.034, 0.015, -0.03, 0.028]],
  [-0.19, -0.02, C.rainbow[3], [0, 0, 0.04, 0.035, -0.02, 0.03]],
  [0.03, 0.01, C.rainbow[5], [0, 0, 0.046, -0.035, 0.02, 0.028]],
  [0.24, -0.05, C.rainbow[1], [0, 0, 0.04, -0.03, -0.025, 0.03]],
  [-0.09, -0.17, C.confetti[5], [0, 0, 0.038, 0.03, 0.02, 0.03]],
  [0.13, -0.18, C.rainbow[0], [0, 0, 0.042, -0.035, 0.015, 0.03]],
] as const

/**
 * A climbing wall panel of plywood with bright lumpy holds, bolted on. A tap (the renderer
 * gives it a shake) and the holds pop one after another across the wall, clack clack clack.
 */
const climbWall: ItemDraw = (ctx, t, play) => {
  void t
  const p = ageOf(play)
  const fine = fineNow()
  ctx.save()
  ctx.lineJoin = 'round'
  box(ctx, -0.4, -0.27, 0.74, 0.52, KIT.wood, 0.05, true, true, 'line')
  if (fine) {
    ctx.beginPath()
    for (let x = -0.34; x < 0.32; x += 0.11)
      for (let y = -0.21; y < 0.22; y += 0.11) {
        ctx.moveTo(x + 0.008, y)
        ctx.arc(x, y, 0.008, 0, TAU)
      }
    ctx.fillStyle = KIT.wood.mark
    ctx.fill()
  }
  for (const [x, y, colour, shape] of HOLDS) {
    const k = 1 + 0.4 * (p < 0 ? 0 : pop((p - (x + 0.4) * 0.6) / 0.22))
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(k, k)
    blob(ctx, shape, colour, 'detail')
    if (fine) {
      circlePath(ctx, 0, 0, 0.009)
      ctx.fillStyle = INK
      ctx.fill()
    }
    ctx.restore()
  }
  ctx.restore()
}

/** The trampoline's mat at rest (its height and half width), and the friend's scale and place on it. */
const TRAMP = { y: -0.21, half: 0.36 }
const BOUNCER_K = 0.66
const BOUNCER_X = -0.07
/** A tap's flip: the friend's flight time and how high it lifts them. */
const FLIP = { time: 0.8, h: 0.27 }

/**
 * A little trampoline with a handle bar and a friend bouncing on it, the mat dipping each
 * time they land. A tap and they push off for a big bounce, tuck and flip over backwards,
 * land and bounce on.
 */
const trampoline: ItemDraw = (ctx, t, play) => {
  const p = ageOf(play)
  const look = FRIENDS[4]!
  const flipping = p >= 0 && p < FLIP.time
  const u = flipping ? 0 : p < 0 ? t : p - FLIP.time
  let rig = posed('bounce', u)
  let rise = 0
  let turn = 0
  // The bounce rig lifts the figure itself; the mat dips while the feet are down.
  const air = flipping ? 1 : arch(loop(u, POSE_LENGTH.bounce, 0))
  let dip = 0.055 * (1 - smooth(0, 0.3, air))
  if (flipping) {
    const crouch = posed('jump', 0.18)
    const tuck: Rig = { ...posed('jump', 0.5), lift: 0, eyes: 'happy', mouth: true }
    const q = clamp01((p - 0.08) / (FLIP.time - 0.08))
    rig = p < 0.08 ? { ...crouch, lift: 0 } : mixRig(tuck, { ...posed('bounce', 0), lift: 0 }, smooth(0.85, 1, q))
    dip = p < 0.08 ? 0.07 : 0.07 * (1 - smooth(0, 0.1, q))
    rise = FLIP.h * arch(q)
    turn = -TAU * smooth(0.1, 0.85, q)
  }
  const matY = TRAMP.y + dip
  ctx.save()
  ctx.lineJoin = 'round'
  shadow(ctx, 0, 0.94)
  // The legs, the far ones darker, and the handle bar's post.
  for (const [x0, x1, colour] of [
    [-0.2, -0.22, BOX.steel.side],
    [0.2, 0.22, BOX.steel.side],
    [-0.34, -0.39, KIT.steel],
    [0.34, 0.39, KIT.steel],
  ] as const) {
    ctx.beginPath()
    ctx.moveTo(x0, TRAMP.y + 0.04)
    ctx.quadraticCurveTo(x1, TRAMP.y + 0.08, x1, -0.012)
    ctx.lineCap = 'round'
    tube(ctx, 0.03, colour)
  }
  rod(ctx, 0.36, TRAMP.y, 0.31, -0.8, 0.032, KIT.steel)
  rod(ctx, 0.22, -0.8, 0.42, -0.8, 0.05, KIT.grip)
  // The mat, sagging where the feet push it.
  ctx.beginPath()
  ctx.moveTo(-TRAMP.half, TRAMP.y + 0.01)
  ctx.quadraticCurveTo(BOUNCER_X, TRAMP.y + 0.01 + 2 * dip, TRAMP.half, TRAMP.y + 0.01)
  ctx.lineCap = 'round'
  tube(ctx, 0.025, KIT.mat)
  // The friend: on the mat, or up in the air turning about their middle.
  const mid = 0.5 * BOUNCER_K
  ctx.save()
  ctx.translate(BOUNCER_X, matY - rise - mid)
  ctx.rotate(turn)
  ctx.translate(0, mid)
  friend(ctx, look, rig, BOUNCER_K)
  ctx.restore()
  roundRectPath(ctx, -0.46, TRAMP.y - 0.025, 0.92, 0.07, 0.035)
  part(ctx, KIT.pad.face, 'line')
  ctx.restore()
}

/** One jumping jack: arms and legs out and in over this many seconds, a hop each way. */
const JACK = 1.0
/** The jumping-jack rig at u seconds: arms from the sides to over the head, feet together to apart, a little hop as they switch. */
function jacks(u: number): Rig {
  const k = loop(u, JACK, 0)
  const open = (1 - Math.cos(TAU * k)) / 2
  const base = posed('stand', u)
  return {
    ...base,
    lift: -0.05 * arch((2 * k) % 1),
    shoulder: [mix(-0.12, 3.75, open), mix(0.3, 2.55, open)],
    elbow: [0.25, 0.25],
    thigh: [mix(-0.04, -0.32, open), mix(0.04, 0.32, open)],
    knee: [0.06, 0.06],
    eyes: open > 0.7 ? 'happy' : base.eyes,
    mouth: open > 0.6,
  }
}

/**
 * A friend doing jumping jacks. A tap and they crouch and leap into a big star jump, arms and
 * legs wide, with stars popping round them, then land and carry on.
 */
const bouncer: ItemDraw = (ctx, t, play) => {
  const p = ageOf(play)
  let rig = jacks(t)
  if (p >= 0 && p < 1.25) {
    const crouch: Rig = { ...posed('jump', 0.18), eyes: 'happy' }
    const star: Rig = { ...jacks(JACK / 2), lift: -0.12, sy: 1.04, shoulder: [3.95, 2.35], thigh: [-0.48, 0.48], knee: [0.05, 0.05], eyes: 'happy', mouth: true }
    if (p < 0.12) rig = mixRig(rig, crouch, smooth(0, 0.12, p))
    else if (p < 0.6) rig = { ...mixRig(crouch, star, smooth(0.12, 0.3, p)), lift: -0.12 * arch((p - 0.12) / 0.48) }
    else if (p < 0.75) rig = mixRig(star, crouch, smooth(0.6, 0.68, p))
    else rig = mixRig(crouch, jacks(t), smooth(0.75, 1.25, p))
  }
  ctx.save()
  ctx.lineJoin = 'round'
  liftShadow(ctx, 0, 0.5, -rig.lift)
  friend(ctx, FRIENDS[7]!, rig, 1)
  for (const [x, y, d] of [
    [-0.36, -0.95, 0.25],
    [0.36, -1.0, 0.3],
    [0.0, -0.18, 0.36],
  ] as const) {
    const s = p < 0 ? 0 : 0.07 * pop((p - d) / 0.6)
    if (s <= 0) continue
    starPath(ctx, x, y, s)
    part(ctx, KIT.star, 'detail')
  }
  ctx.restore()
}

/** The big gym ball's radius. */
const BIG_R = 0.29
/** A tap's bounces: when each starts, how long it flies and how high; the first waits for the squash. */
const BOUNCES = [
  [0.08, 0.6, 0.42],
  [0.68, 0.4, 0.17],
  [1.08, 0.26, 0.07],
  [1.34, 0.14, 0.02],
] as const

/**
 * A big blue gym ball with a yellow band, bouncing a little by itself. A tap and it squashes,
 * bounds high, and bounces lower and lower to rest, its shadow shrinking as it rises.
 */
const bigBall: ItemDraw = (ctx, t, play) => {
  const p = ageOf(play)
  const idle = Math.abs(Math.sin(TAU * loop(t, 3.6, 0)))
  // A tap's bounces take over from the little idle bounce at once and hand back to it by 1.5 s.
  const keep = p < 0 ? 1 : 1 - smooth(0, 0.08, p) + smooth(1.3, 1.5, p)
  let up = 0.02 * idle * keep
  let sq = 0.04 * (1 - smooth(0, 0.25, idle)) * keep
  if (p >= 0)
    BOUNCES.forEach(([at, time, h], i) => {
      up += h * pop((p - at) / time)
      sq = Math.max(sq, (0.16 / (i + 1)) * pop((p - at + 0.08) / 0.16))
    })
  const sy = 1 - sq
  ctx.save()
  ctx.lineJoin = 'round'
  shadow(ctx, 0, 0.62 * clamp01(1 - up * 1.2))
  ctx.translate(0, -up)
  ctx.scale(1 / Math.sqrt(sy), sy)
  const y = -BIG_R
  circlePath(ctx, 0, y, BIG_R)
  ctx.fillStyle = KIT.gymBall
  ctx.fill()
  ctx.save()
  ctx.clip()
  ctx.beginPath()
  ctx.ellipse(0, y + 0.03, BIG_R * 1.05, BIG_R * 0.36, -0.28, 0, TAU)
  ctx.lineWidth = 0.075
  ctx.strokeStyle = KIT.band
  ctx.stroke()
  ctx.restore()
  circlePath(ctx, 0, y, BIG_R)
  ink(ctx, 'line')
  shine(ctx, 0, y, BIG_R)
  ctx.restore()
}

const gym: ThemeArt<'gym'> = {
  wall: gymWall,
  floor: gymFloor,
  glow: GLOW.gym,
  swatches: [GYM_WALLS[0].base, GYM_WALLS[1].base, GYM_WALLS[2].base, GYM_WALLS[3].base],
  items: { rings, climbWall, trampoline, bouncer, bigBall },
}

export const PLAY_ART: { [T in 'play' | 'ballpit' | 'slide' | 'gym']: ThemeArt<T> } = { play, ballpit, slide, gym }
