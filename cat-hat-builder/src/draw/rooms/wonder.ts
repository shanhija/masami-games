import { FRIENDS } from '../../game/catalog'
import { FLOOR_BAND } from '../../game/layout'
import { HEAD, drawRig, inRig, posed, type Rig } from '../builder'
import {
  BOX,
  C,
  TAU,
  arch,
  blob,
  blush,
  box,
  circlePath,
  clamp01,
  detail,
  eyes,
  groundShadow,
  ink,
  loop,
  lw,
  mix,
  part,
  pen,
  puff,
  roundRectPath,
  scaled,
  shine,
  smooth,
  sparklePath,
  speck,
  squash,
  starPath,
  tube,
  type Faces,
} from '../look'
import type { FloorDraw, ItemDraw, ThemeArt, WallDraw } from './types'

/**
 * The wonder rooms: bath, space, sauna. Each theme's wallpaper (four colourings), floor band
 * (four colourings), window glow and its five items.
 *
 * Bath: tiles with big soap bubbles over a band of deeper tiles, a mosaic floor; a bubble
 * lamp, a towel on a rail, a bubble bath with a rubber duck, a big rubber duck friend, and a
 * toilet whose lid jumps while the water swirls away. Space: a night of big stars and ringed
 * planets, a floor of moon ground; a mobile of planets, a porthole full of stars, a toy rocket
 * that lifts off and lands, a friend floating in a bubble helmet, and a robot with a blinking
 * antenna (a visor, never a face). Sauna, as every Finnish child knows it: honey boards with
 * knots, a duckboard floor; a wooden lantern, the birch whisk (vihta), the stove with its
 * stones (kiuas) that puffs a big soft cloud of steam (löyly), a friend on the bench in a
 * towel, and the wooden bucket and ladle (kiulu and kauha).
 *
 * Walls and floors are backdrops: no ink, mid-light, one motif tone on tone in big shapes.
 * Space is a mid-dark night like the Sleep walls, never as dark as the ink, so the inked
 * items, black hair and the darkest skins keep their outline on it. Items are the play layer: inked, flat, made things as boxes with a lit top and a dark right
 * face, round glossy things with one shine tick, a shadow under what stands on the floor.
 */

// ---------------------------------------------------------------------------------------
// The palette

/** The bath walls: the tile, its grout and the soap bubbles' rims (a lighter tone), the bubbles' insides (between the two), the deeper tiles of the band along the bottom. */
const BATH_WALLS = [
  { base: '#CDEFF5', light: '#EAF9FC', bubble: '#D9F4F8', band: '#A8DEEA' },
  { base: '#C2E0F8', light: '#E3F1FC', bubble: '#D0E7FA', band: '#9DCBEF' },
  { base: '#FFEDB8', light: '#FFF8E0', bubble: '#FFF2CA', band: '#FFDA8F' },
  { base: '#FFDCE6', light: '#FFF1F5', bubble: '#FFE5EC', band: '#F8BBCD' },
] as const
/** The bath's mosaic floor: the tiles, the grout, the front edge. */
const BATH_FLOORS = [
  { tile: '#7CC6E2', grout: '#A9DCEF', edge: '#5AA8C8' },
  { tile: '#7ED4C4', grout: '#AAE6DA', edge: '#56B3A3' },
  { tile: '#B6A5E8', grout: '#D3C8F4', edge: '#9583D1' },
  { tile: '#F3C78C', grout: '#FADDB6', edge: '#D7A465' },
] as const
/** The space walls: a mid-dark night (navy, teal, violet, blue), its big stars and ringed planets (a lighter tone), the little twinkling stars (lighter still). */
const SPACE_WALLS = [
  { base: '#4A5FB4', shape: '#5D72C2', dot: '#8394D6' },
  { base: '#1E6A86', shape: '#2A7E9C', dot: '#4FA0BE' },
  { base: '#6E52B4', shape: '#8068C2', dot: '#A08CD6' },
  { base: '#3D5FC4', shape: '#5274CF', dot: '#7B95DE' },
] as const
/** The space floor, moon ground: the ground, its craters, the front edge. */
const SPACE_FLOORS = [
  { ground: '#AEB3CC', crater: '#9499B7', edge: '#8085A4' },
  { ground: '#E79E70', crater: '#CF845A', edge: '#B96F48' },
  { ground: '#9ED8A8', crater: '#80C18C', edge: '#69A976' },
  { ground: '#C1ABE7', crater: '#A790D5', edge: '#8F78C0' },
] as const
/** The sauna walls, boards of wood: the board, every other board a touch lighter, the grooves and the knots with their grain (darker tones). */
const SAUNA_WALLS = [
  { base: '#E9B97A', alt: '#EEC58C', groove: '#D6A363', knot: '#CD9456' },
  { base: '#F3DCAE', alt: '#F7E5C1', groove: '#E3C48F', knot: '#D8B37A' },
  { base: '#E8A884', alt: '#EDB797', groove: '#D48F67', knot: '#C8835B' },
  { base: '#CC9C6C', alt: '#D5AA7E', groove: '#B88653', knot: '#AC7948' },
] as const
/** The sauna floor, a duckboard over tiles: the slats, the tiles in the gaps, the slats' front edge. */
const SAUNA_FLOORS = [
  { slat: '#DDA567', gap: '#8F6D57', edge: '#B97F48' },
  { slat: '#EBC793', gap: '#9A8A7C', edge: '#CBA36C' },
  { slat: '#CB8E66', gap: '#6F5B57', edge: '#A96D47' },
  { slat: '#BC8F60', gap: '#5F5662', edge: '#98724B' },
] as const
/** The colour each theme's windows glow at Good night: cool bath light, violet starlight, the stove's warm orange. */
const GLOW = { bath: '#D6F4FF', space: '#C7B6FF', sauna: '#FFB766' } as const

/** The items' own colours. */
const KIT = {
  chrome: '#D3DCE8',
  cord: '#5A6178',
  water: '#8FDBF5',
  waterDeep: '#4DB5E6',
  bubble: 'rgba(214, 244, 255, 0.6)',
  foam: '#FFFFFF',
  steam: '#F6F3EE',
  duck: '#FFD93A',
  duckWing: '#FFC21A',
  beak: '#FF9A3C',
  beakDark: '#E5741F',
  tub: '#FF8C7A',
  tubFoot: '#FFC93A',
  towel: '#FF8FB3',
  towelBack: '#E46F96',
  towelStripe: '#FFFFFF',
  seat: '#7CCBF0',
  seatEdge: '#4FAAD6',
  space: '#0F1540',
  string: '#E3E6F0',
  earth: '#4AA8FF',
  land: '#4FD36A',
  mars: '#FF7A4F',
  marsDark: '#D9573A',
  ringed: '#FFC266',
  ring: '#FFE6A8',
  moon: '#E9ECF5',
  star: '#FFD93A',
  rocket: '#F5F3EC',
  red: '#FF5A5A',
  redDark: '#D93A3A',
  flame: '#FFD93A',
  flameHot: '#FF8A3A',
  visor: '#2A3350',
  wave: '#7CF2C9',
  plate: '#FFF4DC',
  lampOff: '#C9CFDA',
  lamps: ['#FF5A5A', '#FFD93A', '#4FD36A'],
  antennaOn: '#FF5A5A',
  antennaOff: '#9E3A46',
  helmet: 'rgba(189, 229, 248, 0.35)',
  tank: '#F5F3EC',
  lanternLight: '#FFE3A0',
  fireBack: '#5B2A1C',
  fire: '#FF8A3A',
  fireHot: '#FFD93A',
  stones: ['#8E96AB', '#737B92', '#A6AEC1'],
  leaf: '#86CC55',
  leafDark: '#5AA83A',
  twig: '#8A5A33',
  twine: '#E8CF8E',
  peg: '#C98A4E',
  hoop: '#C8763A',
  bucketInside: '#9C6233',
  kidTowel: '#8FD3F0',
  kidTowelStripe: '#FFFFFF',
  pefletti: '#FFF4DC',
  benchShade: '#B9874F',
} as const
/** The made things' faces: porcelain, the toy robot, the aspen bench, the lantern's wood, the stove's black steel and its stone basket, the bucket's staves. */
const FACES: Record<'porcelain' | 'robot' | 'bench' | 'lantern' | 'stove' | 'basket' | 'bucket', Faces> = {
  porcelain: { face: '#FFFFFF', top: '#FFFFFF', side: '#D3E4EE' },
  robot: { face: '#4AA8FF', top: '#7FC2FF', side: '#2E84D9' },
  bench: { face: '#F0CF98', top: '#F8E1B8', side: '#D4AE73' },
  lantern: { face: '#C98A4E', top: '#DDA66E', side: '#A86C36' },
  stove: { face: '#4A5066', top: '#676E86', side: '#353A4C' },
  basket: { face: '#8E9AAE', top: '#B6C0CF', side: '#5F6B80' },
  bucket: { face: '#DDA05F', top: '#EBBB80', side: '#B87A40' },
}

// ---------------------------------------------------------------------------------------
// Shared helpers

/** True while a tap's reaction runs: `play` seconds since the tap (-1 never, or very large long after) within `end`. */
const active = (play: number, end: number) => play >= 0 && play < end
/** The pull of gravity on drops, in m/s²: slower than the world's, so a splash hangs in the air long enough to see. */
const GRAVITY = 6

/** How much a draw at `heightM` metres tall shows: everything but the finest marks drops at S. */
const fine = (heightM: number) => detail(heightM) !== 'S'

/** A wallpaper's motif layout: `at` at each point of a staggered grid over w x h, rows `step.y` apart, every other row shifted half a step. The column and row let each point pick its own size or kind. */
function scatter(w: number, h: number, step: { x: number; y: number }, at: (x: number, y: number, col: number, row: number) => void) {
  for (let row = 0; row * step.y < h; row++) {
    const shift = (row % 2) * step.x * 0.5
    for (let col = -1; col * step.x < w + step.x; col++) at(step.x * 0.5 + col * step.x + shift, step.y * 0.5 + row * step.y, col, row)
  }
}
/** A small whole number from a grid point, for picking a motif's kind or size without a pattern the eye can see. */
const pick = (col: number, row: number, n: number) => (((col * 7 + row * 3) % n) + n) % n

/** A soap bubble: clear glass, a fine ink ring, and a shine when it is big enough to show one. */
function bubble(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  if (speck(r)) return
  circlePath(ctx, x, y, r)
  part(ctx, KIT.bubble, 'detail')
  if (r * pen.ppm > 5) shine(ctx, x, y, r)
}
/** A water drop of radius r at (x, y), its tail pointing back along `angle` (the way it came from). */
function drop(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, angle: number) {
  if (speck(r)) return
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.beginPath()
  ctx.moveTo(-r * 2.1, 0)
  ctx.quadraticCurveTo(-r * 0.7, -r, 0, -r)
  ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2)
  ctx.quadraticCurveTo(-r * 0.7, r, -r * 2.1, 0)
  ctx.closePath()
  part(ctx, KIT.water, 'detail')
  ctx.restore()
}
/** A splash `u` seconds after it: drops thrown from (x, y), each at [vx, vy, r], flying under gravity and shrinking away over the last third of `life`. */
function splash(ctx: CanvasRenderingContext2D, x: number, y: number, u: number, jets: readonly (readonly [number, number, number])[], life: number) {
  if (u < 0 || u >= life) return
  const k = 1 - smooth(life * 0.66, life, u)
  for (const [vx, vy, r] of jets) {
    const vyNow = vy + GRAVITY * u
    drop(ctx, x + vx * u, y + vy * u + 0.5 * GRAVITY * u * u, r * k, Math.atan2(vyNow, vx))
  }
}
// ---------------------------------------------------------------------------------------
// The rubber duck, the bath's big friend and the little one in the tub

/** The duck's measures, 1 unit tall from its bottom to the top of its head. */
const DUCK = { head: { x: 0.18, y: -0.74, r: 0.26 }, eye: { x: 0.28, y: -0.8, size: 0.09, gap: 0.12 }, hinge: { x: 0.4, y: -0.66 }, wing: { x: 0.06, y: -0.34 } } as const

/**
 * A rubber duck sitting facing right, its bottom centre at the origin, 1 unit tall: the body
 * with its tail up, the wing, the round head with the shine, the beak (`quack` 0 shut to 1
 * wide), the face kit. `flap` lifts the wing (radians). The silhouette is inked at `weight`.
 */
function drawDuck(ctx: CanvasRenderingContext2D, quack: number, flap: number, mood: 'open' | 'happy' | 'closed', weight: 'edge' | 'line', full: boolean) {
  const { head, eye, hinge, wing } = DUCK
  ctx.save()
  ctx.lineJoin = 'round'
  // The body, tail up at the back.
  ctx.beginPath()
  ctx.moveTo(-0.52, -0.68)
  ctx.bezierCurveTo(-0.52, -0.32, -0.42, -0.02, -0.12, 0)
  ctx.lineTo(0.22, 0)
  ctx.bezierCurveTo(0.5, 0, 0.58, -0.28, 0.42, -0.44)
  ctx.bezierCurveTo(0.2, -0.56, -0.08, -0.44, -0.3, -0.5)
  ctx.bezierCurveTo(-0.4, -0.53, -0.47, -0.6, -0.52, -0.68)
  ctx.closePath()
  part(ctx, KIT.duck, weight)
  // The wing: round at the front, its tip pointing back to the tail, lifting about its shoulder.
  ctx.save()
  ctx.translate(wing.x, wing.y)
  ctx.rotate(flap)
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.bezierCurveTo(0.11, 0, 0.14, 0.12, 0.04, 0.15)
  ctx.bezierCurveTo(-0.08, 0.18, -0.23, 0.08, -0.32, -0.06)
  ctx.bezierCurveTo(-0.2, -0.05, -0.09, -0.02, 0, 0)
  ctx.closePath()
  part(ctx, KIT.duckWing, 'line')
  ctx.restore()
  // The flat round-tipped bill: the lower half drops open about the hinge, under the upper half.
  ctx.save()
  ctx.translate(hinge.x, hinge.y)
  ctx.rotate(0.55 * quack)
  ctx.beginPath()
  ctx.moveTo(-0.04, -0.01)
  ctx.quadraticCurveTo(0.12, -0.02, 0.18, 0.0)
  ctx.quadraticCurveTo(0.21, 0.05, 0.12, 0.06)
  ctx.lineTo(-0.03, 0.05)
  ctx.closePath()
  part(ctx, KIT.beakDark, 'line')
  ctx.restore()
  circlePath(ctx, head.x, head.y, head.r)
  part(ctx, KIT.duck, weight)
  ctx.beginPath()
  ctx.moveTo(hinge.x - 0.06, hinge.y - 0.12)
  ctx.quadraticCurveTo(hinge.x + 0.12, hinge.y - 0.16, hinge.x + 0.21, hinge.y - 0.08)
  ctx.quadraticCurveTo(hinge.x + 0.27, hinge.y - 0.02, hinge.x + 0.17, hinge.y + 0.01)
  ctx.lineTo(hinge.x - 0.04, hinge.y + 0.01)
  ctx.closePath()
  part(ctx, KIT.beak, 'line')
  eyes(ctx, eye.x, eye.y, eye.size, eye.gap, mood, KIT.duck)
  if (full) blush(ctx, eye.x + 0.02, eye.y + 0.13, 0.05)
  shine(ctx, head.x, head.y, head.r)
  ctx.restore()
}

// ---------------------------------------------------------------------------------------
// Bath

/** The bath wall's tiles are TILE metres square, laid from the floor up, with GROUT between; the band of deeper tiles is BATH_BAND tall (the floor band hides its lowest 0.2 m). */
const TILE = 0.3
const GROUT = 0.014
const BATH_BAND = 0.8
/** The soap bubbles' grid and their sizes: about five big bubbles to a cell, above the band. */
const BUBBLE_STEP = { x: 0.9, y: 0.62 }
const BUBBLE_SIZES = [0.15, 0.11, 0.17, 0.13] as const

const bathWall: WallDraw = (ctx, w, h, t, variant) => {
  void t
  const c = BATH_WALLS[variant]
  ctx.save()
  ctx.fillStyle = c.base
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = c.band
  ctx.fillRect(0, h - BATH_BAND, w, BATH_BAND)
  // Big soap bubbles: a ring with a fat shine inside at ten o'clock, tone on tone.
  ctx.strokeStyle = c.light
  ctx.fillStyle = c.bubble
  ctx.lineCap = 'round'
  scatter(w, h - BATH_BAND - 0.1, BUBBLE_STEP, (x, y, col, row) => {
    const r = BUBBLE_SIZES[pick(col, row, BUBBLE_SIZES.length)]!
    const bx = x + (pick(row, col, 3) - 1) * 0.06
    ctx.beginPath()
    ctx.arc(bx, y, r, 0, TAU)
    ctx.fill()
    ctx.lineWidth = 0.04
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(bx, y, r * 0.66, Math.PI * 1.05, Math.PI * 1.4)
    ctx.lineWidth = r * 0.22
    ctx.stroke()
  })
  // The grout over it all, from the floor up so the band holds whole tiles.
  ctx.fillStyle = c.light
  ctx.beginPath()
  for (let x = TILE; x < w; x += TILE) ctx.rect(x - GROUT / 2, 0, GROUT, h)
  for (let y = h - TILE; y > 0; y -= TILE) ctx.rect(0, y - GROUT / 2, w, GROUT)
  ctx.fill()
  ctx.restore()
}

/** The bath floor's mosaic: tiles BATH_MOSAIC wide in two rows laid in running bond, and the front edge. */
const BATH_MOSAIC = 0.16
const EDGE = 0.035

const bathFloor: FloorDraw = (ctx, w, t, variant) => {
  void t
  const c = BATH_FLOORS[variant]
  const band = FLOOR_BAND
  const mid = (band - EDGE) / 2
  ctx.save()
  ctx.fillStyle = c.tile
  ctx.fillRect(0, 0, w, band)
  ctx.beginPath()
  ctx.rect(0, mid - GROUT / 2, w, GROUT)
  for (let x = 0; x < w; x += BATH_MOSAIC) {
    ctx.rect(x - GROUT / 2, 0, GROUT, mid)
    ctx.rect(x + BATH_MOSAIC / 2 - GROUT / 2, mid, GROUT, mid)
  }
  ctx.fillStyle = c.grout
  ctx.fill()
  ctx.fillStyle = c.edge
  ctx.fillRect(0, band - EDGE, w, EDGE)
  ctx.restore()
}

/** The bubble lamp's measures from its ceiling anchor: the glass globe's centre and radius, and the two little bubbles stuck to it, (x, y, r) each. */
const GLOBE = { y: 0.36, r: 0.15 }
const STUCK = [
  [-0.15, 0.46, 0.06],
  [0.155, 0.44, 0.045],
] as const
/** Little bubbles drifting up past the lamp all the time: each one's x, size and phase. */
const DRIFT = [
  [-0.3, 0.034, 0],
  [0.29, 0.03, 0.27],
  [-0.24, 0.024, 0.52],
  [0.34, 0.038, 0.76],
] as const
/** The burst of bubbles a tap blows out of the globe: each one's direction (radians, 0 is right). */
const BURST = [-2.7, -2.1, -1.05, -0.45, 2.75, 0.4] as const

/**
 * A glass globe like a big soap bubble on a cord with two little ones stuck to it, a warm
 * bulb inside, little bubbles drifting up past it and popping at the ceiling. A tap
 * brightens the bulb and blows a ring of bubbles out that float off and pop.
 */
const bubbleLamp: ItemDraw = (ctx, t, play) => {
  const full = fine(0.6)
  const tap = active(play, 1.3) ? play : -1
  const bright = tap >= 0 ? arch(clamp01(tap / 1.1)) : 0
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  circlePath(ctx, 0, GLOBE.y, GLOBE.r * (1.6 + 0.3 * bright))
  ctx.fillStyle = C.light
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(0, 0.02)
  ctx.lineTo(0, GLOBE.y - GLOBE.r - 0.03)
  tube(ctx, 0.014, KIT.cord)
  roundRectPath(ctx, -0.075, 0, 0.15, 0.035, 0.015)
  part(ctx, KIT.chrome, 'line')
  circlePath(ctx, 0, GLOBE.y, GLOBE.r)
  part(ctx, KIT.bubble, 'line')
  circlePath(ctx, 0, GLOBE.y + 0.02, 0.06 + 0.025 * bright)
  ctx.fillStyle = C.sparkleWarm
  ctx.fill()
  ink(ctx, 'detail')
  roundRectPath(ctx, -0.05, GLOBE.y - GLOBE.r - 0.04, 0.1, 0.06, 0.02)
  part(ctx, KIT.chrome, 'line')
  shine(ctx, 0, GLOBE.y, GLOBE.r)
  for (const [x, y, r] of STUCK) {
    circlePath(ctx, x, y, r)
    part(ctx, KIT.bubble, 'line')
    shine(ctx, x, y, r)
  }
  if (full) {
    for (const [x, r, phase] of DRIFT) {
      const u = loop(t, 3.4, phase)
      const size = r * smooth(0, 0.12, u) * (1 - smooth(0.86, 1, u))
      bubble(ctx, x + 0.025 * Math.sin(TAU * (u * 1.5 + phase)), 0.54 - 0.44 * u, size)
    }
  }
  if (tap >= 0) {
    const out = smooth(0, 0.9, tap)
    const size = 0.034 * smooth(0, 0.12, tap) * (1 - smooth(0.85, 1.3, tap))
    BURST.forEach((a, i) => {
      const d = GLOBE.r + 0.03 + 0.17 * out
      bubble(ctx, Math.cos(a) * d, GLOBE.y + Math.sin(a) * d - 0.05 * out, size * (i % 2 === 0 ? 1 : 0.75))
    })
  }
  ctx.restore()
}

/** The towel rail's height from the slot's centre, and its ends. */
const RAIL = { y: -0.2, x: 0.38 }
/** The towel's front panel from the rail down: its sides and hem. */
const TOWEL = { x0: -0.26, x1: 0.24, hem: 0.46 }

/** One panel of the towel hanging from the rail (origin on the rail), `long` metres down, its sides at x0 and x1, the hem in a gentle wave. */
function towelPath(ctx: CanvasRenderingContext2D, x0: number, x1: number, long: number) {
  ctx.beginPath()
  ctx.moveTo(x0, long)
  ctx.lineTo(x0, 0)
  ctx.quadraticCurveTo(x0, -0.045, x0 + 0.045, -0.045)
  ctx.lineTo(x1 - 0.045, -0.045)
  ctx.quadraticCurveTo(x1, -0.045, x1, 0)
  ctx.lineTo(x1, long)
  ctx.quadraticCurveTo(x1 - (x1 - x0) * 0.25, long + 0.03, (x0 + x1) / 2, long)
  ctx.quadraticCurveTo(x0 + (x1 - x0) * 0.25, long - 0.03, x0, long)
  ctx.closePath()
}

/**
 * A chrome rail on two brackets with a striped bath towel over it; the towel's hem sways in
 * the warm air (the renderer sways the rail too), and a tap flaps it about until it settles.
 */
const towelRack: ItemDraw = (ctx, t, play) => {
  const full = fine(0.6)
  let lean = 0.05 * Math.sin(TAU * loop(t, 2.9, 0.2))
  if (active(play, 1.5)) lean += 0.42 * Math.sin(TAU * 1.7 * play) * (1 - play / 1.5) ** 2
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  for (const x of [-0.33, 0.33]) {
    roundRectPath(ctx, x - 0.03, RAIL.y - 0.06, 0.06, 0.12, 0.025)
    part(ctx, KIT.chrome, 'line')
  }
  // The back panel peeks out under the front one, a little shorter and swinging less.
  ctx.save()
  ctx.translate(0, RAIL.y)
  ctx.transform(1, 0, lean * 0.7, 1, 0, 0)
  towelPath(ctx, TOWEL.x0 + 0.05, TOWEL.x1 + 0.03, TOWEL.hem - 0.06)
  part(ctx, KIT.towelBack, 'line')
  ctx.restore()
  ctx.beginPath()
  ctx.moveTo(-RAIL.x, RAIL.y)
  ctx.lineTo(RAIL.x, RAIL.y)
  tube(ctx, 0.032, KIT.chrome)
  for (const x of [-RAIL.x, RAIL.x]) {
    circlePath(ctx, x, RAIL.y, 0.028)
    part(ctx, KIT.chrome, 'detail')
  }
  // The front panel, sheared so its top stays on the rail while the hem swings.
  ctx.save()
  ctx.translate(0, RAIL.y)
  ctx.transform(1, 0, lean, 1, 0, 0)
  towelPath(ctx, TOWEL.x0, TOWEL.x1, TOWEL.hem)
  ctx.fillStyle = KIT.towel
  ctx.fill()
  ctx.save()
  ctx.clip()
  ctx.fillStyle = KIT.towelStripe
  ctx.fillRect(TOWEL.x0, TOWEL.hem - 0.13, TOWEL.x1 - TOWEL.x0, 0.045)
  if (full) ctx.fillRect(TOWEL.x0, TOWEL.hem - 0.06, TOWEL.x1 - TOWEL.x0, 0.02)
  ctx.restore()
  ink(ctx, 'line')
  ctx.restore()
  ctx.restore()
}

/** The bathtub's measures from its floor anchor: the rim's height and half width, and where the duck sits on the foam. */
const TUB = { rim: -0.6, half: 0.47, duck: { x: 0.06, y: -0.74, size: 0.22 } }
/** The foam piled over the rim: (x, y, r) triples. */
const FOAM = [-0.33, -0.64, 0.1, -0.17, -0.7, 0.12, 0.03, -0.72, 0.12, 0.21, -0.69, 0.11, 0.36, -0.64, 0.09] as const
/** The splash when the duck squeaks: each drop's [vx, vy, r] (m/s, m/s, m). */
const TUB_SPLASH = [
  [-0.42, -1.6, 0.026],
  [-0.24, -1.95, 0.022],
  [-0.08, -2.1, 0.028],
  [0.12, -2.0, 0.024],
  [0.3, -1.8, 0.028],
  [0.44, -1.45, 0.022],
] as const
/** Bubbles rising off the foam all the time: each one's x and phase. */
const FIZZ = [
  [-0.22, 0],
  [0.32, 0.38],
  [-0.02, 0.7],
] as const

/** The rubber duck's tap in the tub: squashed flat as it squeaks, then a hop up out of the foam and back, a little squash on landing. Returns [lift, sx, sy]. */
function squeak(play: number): [number, number, number] {
  if (!active(play, 1.2)) return [0, 1, 1]
  if (play < 0.16) {
    const k = smooth(0, 0.16, play)
    return [0, 1 + 0.25 * k, 1 - 0.3 * k]
  }
  if (play < 0.62) {
    const u = (play - 0.16) / 0.46
    const k = 1 - smooth(0, 0.3, u)
    return [0.16 * arch(u), 1 + 0.25 * k, 1 - 0.3 * k + 0.1 * arch(u)]
  }
  const [sx, sy] = squash((play - 0.62) * 1.6)
  return [0, sx, sy]
}

/**
 * A clawfoot tub, coral outside and white at the rim, heaped with foam; a rubber duck rides
 * the foam, bobbing, and bubbles rise off it. A tap squeaks the duck flat, it hops up out of
 * the foam and drops back in with a splash of drops that fly up and fall away.
 */
const bathtub: ItemDraw = (ctx, t, play) => {
  const full = fine(1.15)
  const puffUp = active(play, 0.9) ? 1 + 0.12 * arch(clamp01((play - 0.55) / 0.35)) : 1
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  groundShadow(ctx, 0.95)
  // Two of its four clawfeet, each a little golden leg splaying out onto the floor.
  for (const x of [-0.3, 0.3]) {
    ctx.beginPath()
    ctx.moveTo(x - 0.045, -0.17)
    ctx.bezierCurveTo(x - 0.035, -0.08, x - 0.09, -0.05, x - 0.09, 0)
    ctx.lineTo(x + 0.07, 0)
    ctx.bezierCurveTo(x + 0.07, -0.05, x + 0.035, -0.08, x + 0.045, -0.17)
    ctx.closePath()
    part(ctx, KIT.tubFoot, 'line')
  }
  // The tap at the back end, a chrome spout curling over the foam.
  ctx.beginPath()
  ctx.moveTo(-0.41, TUB.rim)
  ctx.lineTo(-0.41, -0.88)
  ctx.quadraticCurveTo(-0.41, -0.95, -0.34, -0.95)
  ctx.lineTo(-0.3, -0.95)
  ctx.lineTo(-0.3, -0.9)
  tube(ctx, 0.034, KIT.chrome)
  if (full) {
    circlePath(ctx, -0.41, -0.78, 0.03)
    part(ctx, KIT.chrome, 'detail')
  }
  const foam: number[] = []
  for (let i = 0; i < FOAM.length; i += 3) foam.push(FOAM[i]!, FOAM[i + 1]!, FOAM[i + 2]! * puffUp)
  blob(ctx, foam, KIT.foam, 'line')
  // The tub over the foam's bottom, its rim a white lip.
  ctx.beginPath()
  ctx.moveTo(-TUB.half, TUB.rim)
  ctx.lineTo(TUB.half, TUB.rim)
  ctx.bezierCurveTo(TUB.half, -0.3, 0.42, -0.13, 0.28, -0.13)
  ctx.lineTo(-0.28, -0.13)
  ctx.bezierCurveTo(-0.42, -0.13, -TUB.half, -0.3, -TUB.half, TUB.rim)
  ctx.closePath()
  part(ctx, KIT.tub, 'line')
  shine(ctx, -0.16, -0.36, 0.26)
  roundRectPath(ctx, -TUB.half - 0.03, TUB.rim - 0.045, 2 * TUB.half + 0.06, 0.07, 0.035)
  part(ctx, KIT.foam, 'line')
  // The duck on the foam: a slow bob and rock, and its squeak.
  const [lift, sx, sy] = squeak(play)
  const bob = 0.012 * Math.sin(TAU * loop(t, 2.4, 0.1))
  ctx.save()
  ctx.translate(TUB.duck.x, TUB.duck.y + bob - lift)
  ctx.rotate(0.06 * Math.sin(TAU * loop(t, 2.4, 0.35)))
  ctx.scale(sx, sy)
  scaled(ctx, TUB.duck.size, () => drawDuck(ctx, active(play, 0.3) ? 1 : 0, 0, active(play, 1) ? 'happy' : 'open', 'line', false))
  ctx.restore()
  if (full) {
    for (const [x, phase] of FIZZ) {
      const u = loop(t, 2.8, phase)
      bubble(ctx, x + 0.02 * Math.sin(TAU * (u + phase)), -0.82 - 0.22 * u, 0.03 * smooth(0, 0.15, u) * (1 - smooth(0.8, 1, u)))
    }
  }
  splash(ctx, TUB.duck.x, -0.76, play - 0.55, TUB_SPLASH, 0.75)
  ctx.restore()
}

/** The big duck's height (a friend as big as a child sitting down), and how far it sits back so its body and bill are centred over the anchor. */
const BIG_DUCK = { size: 0.86, back: -0.04 }

/**
 * A big rubber duck friend sitting on the floor, its shine on its head, blinking now and
 * then (the renderer bobs it). A tap: two quacks with the beak wide and the wings up, eyes
 * happy, while the renderer hops it.
 */
const bigDuck: ItemDraw = (ctx, t, play) => {
  const tap = active(play, 1) ? play : -1
  const quack = tap >= 0 ? Math.max(arch(clamp01(tap / 0.3)), arch(clamp01((tap - 0.38) / 0.3))) : 0
  const flap = tap >= 0 ? 0.7 * arch(clamp01(tap / 0.7)) : 0
  const mood = tap >= 0 ? 'happy' : loop(t, 3.6, 0.4) > 0.96 ? 'closed' : 'open'
  ctx.save()
  groundShadow(ctx, 0.78)
  ctx.translate(BIG_DUCK.back, 0)
  scaled(ctx, BIG_DUCK.size, () => drawDuck(ctx, quack, flap, mood, 'edge', fine(BIG_DUCK.size)))
  ctx.restore()
}

/** The toilet's measures from its floor anchor: the cistern, the bowl's rim, the seat's opening, the lid's hinge and length, the flush lever. */
const CISTERN = { x: -0.4, y: -0.95, w: 0.3, h: 0.44 }
const RIM_Y = -0.47
const SEAT = { x: 0.1, rx: 0.31, ry: 0.085, hole: { rx: 0.22, ry: 0.05 } }
const HINGE = { x: -0.2, y: RIM_Y - 0.015 }
const LID = { half: 0.31, ry: 0.085, thick: 0.03 }
const LEVER = { x: -0.38, y: -0.87 }
/** How far the lid opens (radians, up against the cistern). */
const LID_OPEN = -1.52

/** The lid's angle `play` seconds after a flush: shut, it jumps open, chatters against the cistern while the water swirls, falls shut and bounces twice on the seat. */
function lidAngle(play: number): number {
  if (!active(play, 1.6)) return 0
  if (play < 0.1) return 0
  if (play < 0.28) return LID_OPEN * smooth(0.1, 0.28, play)
  if (play < 1.0) return LID_OPEN + 0.3 * Math.abs(Math.sin(TAU * 2.1 * (play - 0.28))) * (1 - (play - 0.28) / 0.72)
  if (play < 1.14) return LID_OPEN * (1 - smooth(1.0, 1.14, play))
  return -0.22 * Math.abs(Math.sin(TAU * 2.2 * (play - 1.14))) * (1 - (play - 1.14) / 0.46)
}
/** The drops that jump out of the bowl at the height of the flush. */
const FLUSH_DROPS = [
  [-0.18, -1.5, 0.022],
  [0.06, -1.75, 0.026],
  [0.26, -1.4, 0.02],
] as const

/** The water in the bowl, seen from a little above: calm, or swirling round and down `u` (0 to 1) into the flush. */
function drawBowlWater(ctx: CanvasRenderingContext2D, u: number) {
  const { rx, ry } = SEAT.hole
  ctx.save()
  ctx.beginPath()
  ctx.ellipse(SEAT.x, RIM_Y, rx, ry, 0, 0, TAU)
  ctx.fillStyle = KIT.water
  ctx.fill()
  ctx.clip()
  if (u > 0 && u < 1) {
    // Two arms of a spiral turning ever faster and drawing in to the middle.
    const spin = 14 * u * u + 3 * u
    const reach = 1 - 0.55 * smooth(0.6, 1, u)
    ctx.beginPath()
    for (const arm of [0, Math.PI]) {
      for (let i = 0; i <= 24; i++) {
        const k = i / 24
        const a = arm - spin - k * TAU * 0.9
        const r = rx * reach * (1 - 0.85 * k)
        const x = SEAT.x + Math.cos(a) * r
        const y = RIM_Y + Math.sin(a) * r * (ry / rx)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
    }
    ctx.lineWidth = 0.028
    ctx.lineCap = 'round'
    ctx.strokeStyle = KIT.waterDeep
    ctx.stroke()
  }
  ctx.restore()
  ctx.beginPath()
  ctx.ellipse(SEAT.x, RIM_Y, rx, ry, 0, 0, TAU)
  ink(ctx, 'detail')
}

/**
 * A clean white toilet with a sky-blue seat, its lid shut. A tap pulls the lever: the lid
 * jumps open and chatters against the cistern while the water swirls round and away, a few
 * drops hop out of the bowl, the toilet wobbles, and the lid falls shut with two bounces.
 */
const toilet: ItemDraw = (ctx, t, play) => {
  void t
  const full = fine(1.15)
  const tap = active(play, 1.6) ? play : -1
  const wobble = tap >= 0 && tap < 0.9 ? 0.03 * Math.sin(TAU * 4 * tap) * smooth(0.1, 0.3, tap) * (1 - smooth(0.4, 0.9, tap)) : 0
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  groundShadow(ctx, 0.72)
  ctx.rotate(wobble)
  // The lever on the cistern's side, pulled down on the flush.
  ctx.save()
  ctx.translate(LEVER.x, LEVER.y)
  ctx.rotate(-0.25 + (tap >= 0 ? 0.6 * arch(clamp01(tap / 0.35)) : 0))
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(-0.09, 0)
  tube(ctx, 0.026, KIT.chrome)
  ctx.restore()
  box(ctx, CISTERN.x, CISTERN.y, CISTERN.w, CISTERN.h, FACES.porcelain, 0.06, true, true, 'line')
  roundRectPath(ctx, CISTERN.x - 0.02, CISTERN.y - 0.03, CISTERN.w + 0.04, 0.05, 0.02)
  part(ctx, FACES.porcelain.face, 'line')
  circlePath(ctx, LEVER.x, LEVER.y, 0.025)
  part(ctx, KIT.chrome, 'detail')
  // The bowl on its foot.
  ctx.beginPath()
  ctx.moveTo(-0.22, RIM_Y)
  ctx.lineTo(0.41, RIM_Y)
  ctx.bezierCurveTo(0.41, -0.3, 0.3, -0.2, 0.15, -0.18)
  ctx.lineTo(0.13, -0.05)
  ctx.quadraticCurveTo(0.14, 0, 0.21, 0)
  ctx.lineTo(-0.17, 0)
  ctx.quadraticCurveTo(-0.1, 0, -0.1, -0.05)
  ctx.lineTo(-0.1, -0.2)
  ctx.bezierCurveTo(-0.18, -0.25, -0.22, -0.33, -0.22, RIM_Y)
  ctx.closePath()
  part(ctx, FACES.porcelain.face, 'line')
  shine(ctx, 0.16, -0.38, 0.2)
  // The seat and the water in it; the lid over them when it is shut.
  ctx.beginPath()
  ctx.ellipse(SEAT.x, RIM_Y, SEAT.rx, SEAT.ry, 0, 0, TAU)
  part(ctx, KIT.seat, 'line')
  drawBowlWater(ctx, tap >= 0 ? clamp01((tap - 0.2) / 0.85) : 0)
  ctx.save()
  ctx.translate(HINGE.x, HINGE.y)
  ctx.rotate(lidAngle(play))
  ctx.beginPath()
  ctx.ellipse(LID.half, LID.thick, LID.half, LID.ry, 0, 0, TAU)
  part(ctx, KIT.seatEdge, 'line')
  ctx.beginPath()
  ctx.ellipse(LID.half, 0, LID.half, LID.ry, 0, 0, TAU)
  part(ctx, KIT.seat, 'line')
  if (full) shine(ctx, LID.half * 1.3, 0, LID.ry * 1.4)
  ctx.restore()
  splash(ctx, SEAT.x, RIM_Y - 0.02, tap - 0.4, FLUSH_DROPS, 0.55)
  ctx.restore()
}

// ---------------------------------------------------------------------------------------
// Space

/** The space wall's big shapes: a star or a ringed planet every SPACE_STEP, about five to a cell; little stars between them on a finer grid. */
const SPACE_STEP = { x: 0.9, y: 0.7 }
const DOT_STEP = { x: 0.42, y: 0.36 }

const spaceWall: WallDraw = (ctx, w, h, t, variant) => {
  const c = SPACE_WALLS[variant]
  ctx.save()
  ctx.fillStyle = c.base
  ctx.fillRect(0, 0, w, h)
  // Little stars twinkling slowly, each on its own beat, nudged off the grid.
  ctx.fillStyle = c.dot
  scatter(w, h, DOT_STEP, (x, y, col, row) => {
    const tw = 0.65 + 0.35 * Math.sin(TAU * loop(t, 2.8, pick(col, row, 10) / 10))
    sparklePath(ctx, x + 0.21 + (pick(row, col, 5) - 2) * 0.04, y + 0.18 + (pick(col, row, 3) - 1) * 0.05, 0.07 * tw)
    ctx.fill()
  })
  ctx.fillStyle = c.shape
  ctx.strokeStyle = c.shape
  scatter(w, h, SPACE_STEP, (x, y, col, row) => {
    ctx.save()
    ctx.translate(x, y)
    if (pick(col, row, 5) === 0) {
      ctx.rotate(-0.35)
      circlePath(ctx, 0, 0, 0.13)
      ctx.fill()
      ctx.beginPath()
      ctx.ellipse(0, 0, 0.25, 0.065, 0, 0, TAU)
      ctx.lineWidth = 0.035
      ctx.stroke()
    } else {
      ctx.rotate((pick(col, row, 5) - 2) * 0.14)
      starPath(ctx, 0, 0, pick(row, col, 2) === 0 ? 0.16 : 0.12)
      ctx.fill()
    }
    ctx.restore()
  })
  ctx.restore()
}

/** The moon floor's craters: [x, y, rx], repeating every CRATER_EVERY metres. */
const CRATERS = [
  [0.22, 0.07, 0.1],
  [0.66, 0.11, 0.06],
  [1.02, 0.065, 0.075],
] as const
const CRATER_EVERY = 1.3

const spaceFloor: FloorDraw = (ctx, w, t, variant) => {
  void t
  const c = SPACE_FLOORS[variant]
  ctx.save()
  ctx.fillStyle = c.ground
  ctx.fillRect(0, 0, w, FLOOR_BAND)
  ctx.fillStyle = c.crater
  ctx.beginPath()
  for (let x0 = 0; x0 < w; x0 += CRATER_EVERY)
    for (const [x, y, rx] of CRATERS) {
      ctx.moveTo(x0 + x + rx, y)
      ctx.ellipse(x0 + x, y, rx, rx * 0.32, 0, 0, TAU)
    }
  ctx.fill()
  ctx.fillStyle = c.edge
  ctx.fillRect(0, FLOOR_BAND - EDGE, w, EDGE)
  ctx.restore()
}

/** A planet of radius r at (x, y): Earth with its land, red Mars with craters, or a ringed planet (its ring's back half behind it). */
function planet(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, kind: 'earth' | 'mars' | 'ringed', full: boolean) {
  if (kind === 'ringed') ringHalf(ctx, x, y, r, 'back')
  circlePath(ctx, x, y, r)
  part(ctx, kind === 'earth' ? KIT.earth : kind === 'mars' ? KIT.mars : KIT.ringed, 'line')
  if (full) {
    ctx.save()
    circlePath(ctx, x, y, r)
    ctx.clip()
    if (kind === 'earth') {
      blob(ctx, [x - r * 0.35, y - r * 0.2, r * 0.42, x + r * 0.45, y + r * 0.45, r * 0.35], KIT.land, 'detail')
    } else if (kind === 'mars') {
      ctx.beginPath()
      ctx.moveTo(x + r * 0.5, y + r * 0.2)
      ctx.arc(x + r * 0.3, y + r * 0.2, r * 0.2, 0, TAU)
      ctx.moveTo(x - r * 0.15, y - r * 0.35)
      ctx.arc(x - r * 0.3, y - r * 0.35, r * 0.15, 0, TAU)
      ctx.fillStyle = KIT.marsDark
      ctx.fill()
    } else {
      ctx.beginPath()
      ctx.rect(x - r, y - r * 0.15, 2 * r, r * 0.25)
      ctx.fillStyle = KIT.ring
      ctx.fill()
    }
    ctx.restore()
    circlePath(ctx, x, y, r)
    ink(ctx, 'line')
  }
  shine(ctx, x, y, r)
  if (kind === 'ringed') ringHalf(ctx, x, y, r, 'front')
}
/** Half of a ringed planet's ring: the back half goes behind the planet, the front half over it. */
function ringHalf(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, half: 'back' | 'front') {
  const [from, to] = half === 'back' ? [Math.PI, TAU] : [0, Math.PI]
  ctx.beginPath()
  ctx.ellipse(x, y, r * 1.6, r * 0.4, -0.3, from, to)
  ctx.lineCap = 'round'
  tube(ctx, r * 0.24, KIT.ring)
}

/** The mobile's rod, a string's length below the ceiling, and what hangs from it: each pendant's x on the rod, string length, size and kind. */
const ROD = { y: 0.1, half: 0.36 }
const PENDANTS = [
  { x: -0.32, len: 0.27, r: 0.09, kind: 'mars' },
  { x: -0.15, len: 0.43, r: 0.065, kind: 'star' },
  { x: 0.02, len: 0.21, r: 0.12, kind: 'earth' },
  { x: 0.16, len: 0.45, r: 0.065, kind: 'moon' },
  { x: 0.31, len: 0.26, r: 0.085, kind: 'ringed' },
] as const

/** A crescent moon of radius r at (x, y), lit on its right. */
function crescent(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x - r * 0.1, y - r)
  ctx.bezierCurveTo(x + r * 1.3, y - r * 0.9, x + r * 1.3, y + r * 0.9, x - r * 0.1, y + r)
  ctx.bezierCurveTo(x + r * 0.55, y + r * 0.55, x + r * 0.55, y - r * 0.55, x - r * 0.1, y - r)
  ctx.closePath()
  part(ctx, KIT.moon, 'line')
}

/**
 * A mobile of planets: a rod on a string with Mars, a star, Earth, the moon and a ringed
 * planet hanging off it, each swinging a little on its own string (the renderer sways the
 * whole mobile gently from its hook). A tap swings them out wide as it spins, then back.
 */
const planets: ItemDraw = (ctx, t, play) => {
  const full = fine(0.6)
  const out = active(play, 1.4) ? arch(clamp01(play / 1.2)) : 0
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(0, ROD.y)
  ctx.lineWidth = lw('detail')
  ctx.strokeStyle = KIT.string
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(-ROD.half, ROD.y)
  ctx.lineTo(ROD.half, ROD.y)
  tube(ctx, 0.022, BOX.steel.top)
  PENDANTS.forEach((p, i) => {
    const swing = 0.07 * Math.sin(TAU * loop(t, 2.2 + 0.35 * i, 0.21 * i)) - Math.sign(p.x) * 0.2 * out
    ctx.save()
    ctx.translate(p.x, ROD.y)
    ctx.rotate(swing)
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(0, p.len - p.r)
    ctx.lineWidth = lw('detail')
    ctx.strokeStyle = KIT.string
    ctx.stroke()
    ctx.rotate(-swing)
    const x = -Math.sin(swing) * p.len
    const y = Math.cos(swing) * p.len
    if (p.kind === 'star') {
      starPath(ctx, x, y, p.r)
      part(ctx, KIT.star, 'line')
    } else if (p.kind === 'moon') crescent(ctx, x, y, p.r)
    else planet(ctx, x, y, p.r, p.kind, full)
    ctx.restore()
  })
  ctx.restore()
}

/** The porthole: the frame's outer and inner rounded rects. */
const PORT = { w: 0.86, h: 0.56, r: 0.22, rim: 0.07 }
/** The stars seen through it: [x, y, size, phase]. */
const PORT_STARS = [
  [-0.24, -0.1, 0.09, 0],
  [-0.05, -0.15, 0.06, 0.3],
  [0.14, -0.05, 0.08, 0.6],
  [-0.15, 0.08, 0.055, 0.45],
  [0.27, -0.13, 0.05, 0.8],
  [0.02, 0.06, 0.045, 0.15],
] as const

/** A shooting star crossing the porthole, `u` from 0 to 1 along its way. */
function shootingStar(ctx: CanvasRenderingContext2D, u: number) {
  const x = mix(-0.34, 0.26, u)
  const y = mix(-0.17, 0.05, u)
  ctx.beginPath()
  ctx.moveTo(x - 0.16, y - 0.06)
  ctx.lineTo(x, y)
  ctx.lineWidth = 0.022
  ctx.strokeStyle = C.sparkleWarm
  ctx.stroke()
  sparklePath(ctx, x, y, 0.09)
  ctx.fillStyle = C.sparkle
  ctx.fill()
}

/**
 * A spaceship porthole in a bolted steel frame: deep space, stars twinkling slowly, the
 * Earth peeking in at a corner, and a shooting star every few seconds. A tap sends a
 * shooting star across at once and makes every star twinkle big.
 */
const starWindow: ItemDraw = (ctx, t, play) => {
  const full = fine(0.6)
  const tap = active(play, 1.2) ? play : -1
  const iw = PORT.w - 2 * PORT.rim
  const ih = PORT.h - 2 * PORT.rim
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  roundRectPath(ctx, -PORT.w / 2, -PORT.h / 2, PORT.w, PORT.h, PORT.r)
  part(ctx, BOX.steel.face, 'line')
  ctx.save()
  roundRectPath(ctx, -iw / 2, -ih / 2, iw, ih, PORT.r - PORT.rim)
  ctx.fillStyle = KIT.space
  ctx.fill()
  ctx.clip()
  planet(ctx, 0.24, 0.19, 0.16, 'earth', full)
  const big = tap >= 0 ? 0.6 * arch(clamp01(tap / 1.0)) : 0
  for (const [x, y, size, phase] of PORT_STARS) {
    sparklePath(ctx, x, y, size * (0.8 + 0.2 * Math.sin(TAU * loop(t, 2.4, phase)) + big))
    ctx.fillStyle = C.sparkleWarm
    ctx.fill()
  }
  const fly = tap >= 0 ? tap / 0.7 : loop(t, 7, 0.4) / 0.1
  if (fly < 1) shootingStar(ctx, fly)
  if (full) {
    // Two glints across the glass.
    ctx.beginPath()
    ctx.moveTo(-0.3, 0.02)
    ctx.lineTo(-0.2, -0.13)
    ctx.moveTo(-0.25, 0.09)
    ctx.lineTo(-0.12, -0.11)
    ctx.lineWidth = 0.018
    ctx.strokeStyle = C.white
    ctx.stroke()
  }
  ctx.restore()
  roundRectPath(ctx, -iw / 2, -ih / 2, iw, ih, PORT.r - PORT.rim)
  ink(ctx, 'line')
  if (full) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + TAU / 16
      circlePath(ctx, Math.cos(a) * (PORT.w / 2 - PORT.rim / 2) * 0.93, Math.sin(a) * (PORT.h / 2 - PORT.rim / 2) * 0.93, 0.016)
      part(ctx, BOX.steel.side, 'detail')
    }
  }
  ctx.restore()
}

/** The rocket's tap: [lift, wobble, sx, sy] `play` seconds after it. Wobble on the pad, lift a hand's height, hover, land with a squash. */
function launch(play: number): [number, number, number, number] {
  if (!active(play, 1.6)) return [0, 0, 1, 1]
  const wobble = play < 0.5 ? 0.07 * Math.sin(TAU * 5 * play) * smooth(0, 0.15, play) * (1 - smooth(0.3, 0.5, play)) : 0
  const lift = 0.14 * smooth(0.35, 0.6, play) * (1 - smooth(0.95, 1.2, play)) + (play > 0.6 && play < 0.95 ? 0.008 * Math.sin(TAU * 6 * play) : 0)
  const [sx, sy] = play > 1.2 ? squash((play - 1.2) * 2.4) : [1, 1]
  return [lift, wobble, sx, sy]
}
/** The smoke puffs blown out at the rocket's foot: each one's side, delay and size. */
const ROCKET_PUFFS = [
  [-1, 0.32, 0.085],
  [1, 0.38, 0.09],
  [-1, 0.5, 0.07],
  [1, 0.58, 0.075],
  [-1, 1.12, 0.08],
  [1, 1.16, 0.08],
] as const

/**
 * A toy rocket on three fins: a red nose, a white body with a red band and a porthole, a
 * steel nozzle. A tap: it wobbles on the pad, puffs smoke out both sides, lifts a hand's
 * height on a flame, hovers, and lands with a squash and a last puff.
 */
const rocket: ItemDraw = (ctx, t, play) => {
  void t
  const full = fine(1.15)
  const [lift, wobble, sx, sy] = launch(play)
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  groundShadow(ctx, 0.64 * (1 - lift * 2))
  if (active(play, 1.6)) {
    for (const [side, delay, r] of ROCKET_PUFFS) {
      const u = clamp01((play - delay) / 0.5)
      if (u > 0 && u < 1) puff(ctx, side * (0.14 + 0.2 * smooth(0, 1, u)), -0.06 - 0.06 * u, r * arch(u) * 1.2, KIT.steam)
    }
  }
  ctx.translate(0, -lift)
  ctx.rotate(wobble)
  ctx.scale(sx, sy)
  // The flame under the nozzle while it flies, flickering in shape only.
  const flame = active(play, 1.3) ? smooth(0.3, 0.45, play) * (1 - smooth(1.05, 1.2, play)) * (1 + 0.15 * Math.sin(TAU * 7 * play)) : 0
  if (flame > 0) {
    for (const [colour, k] of [
      [KIT.flameHot, 1],
      [KIT.flame, 0.6],
    ] as const) {
      ctx.beginPath()
      ctx.moveTo(-0.09 * k, -0.09)
      ctx.quadraticCurveTo(-0.08 * k, -0.09 + 0.12 * flame * k, 0, -0.09 + 0.2 * flame * k)
      ctx.quadraticCurveTo(0.08 * k, -0.09 + 0.12 * flame * k, 0.09 * k, -0.09)
      ctx.closePath()
      part(ctx, colour, 'detail')
    }
  }
  ctx.beginPath()
  ctx.moveTo(-0.08, -0.18)
  ctx.lineTo(0.08, -0.18)
  ctx.lineTo(0.11, -0.08)
  ctx.lineTo(-0.11, -0.08)
  ctx.closePath()
  part(ctx, BOX.steel.face, 'line')
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(s * 0.15, -0.44)
    ctx.quadraticCurveTo(s * 0.35, -0.32, s * 0.36, -0.02)
    ctx.lineTo(s * 0.2, -0.07)
    ctx.lineTo(s * 0.15, -0.2)
    ctx.closePath()
    part(ctx, KIT.red, 'line')
  }
  // The body, the nose cone over its top, the band and the porthole.
  ctx.beginPath()
  ctx.moveTo(-0.17, -0.72)
  ctx.bezierCurveTo(-0.17, -0.89, -0.08, -0.98, 0, -1.02)
  ctx.bezierCurveTo(0.08, -0.98, 0.17, -0.89, 0.17, -0.72)
  ctx.lineTo(0.16, -0.25)
  ctx.quadraticCurveTo(0.15, -0.16, 0.07, -0.16)
  ctx.lineTo(-0.07, -0.16)
  ctx.quadraticCurveTo(-0.15, -0.16, -0.16, -0.25)
  ctx.closePath()
  ctx.fillStyle = KIT.rocket
  ctx.fill()
  ctx.save()
  ctx.clip()
  ctx.fillStyle = KIT.red
  ctx.fillRect(-0.2, -1.05, 0.4, 0.3)
  ctx.fillRect(-0.2, -0.36, 0.4, 0.06)
  ctx.restore()
  ink(ctx, 'line')
  ctx.beginPath()
  ctx.moveTo(-0.17, -0.75)
  ctx.quadraticCurveTo(0, -0.71, 0.17, -0.75)
  ink(ctx, 'detail')
  shine(ctx, 0, -0.84, 0.15)
  circlePath(ctx, 0, -0.56, 0.085)
  part(ctx, BOX.steel.top, 'line')
  circlePath(ctx, 0, -0.56, 0.055)
  part(ctx, C.glassTint, 'detail')
  if (full) shine(ctx, 0, -0.56, 0.055)
  // The front fin, edge on: a blade widening to the floor.
  ctx.beginPath()
  ctx.moveTo(-0.008, -0.3)
  ctx.lineTo(0.008, -0.3)
  ctx.lineTo(0.04, 0)
  ctx.lineTo(-0.04, 0)
  ctx.closePath()
  part(ctx, KIT.redDark, 'line')
  ctx.restore()
}

/** The astronaut friend: which friend, at what size (the helmet has to fit the room's floor box as they float). */
const ASTRONAUT = { look: FRIENDS[1]!, k: 0.84 }
/** The helmet, in the rig's upper body (it rests on the shoulders): a glass dome round the head, cut flat at the neck where it sits in its collar (`neck` below the dome's centre). */
const HELMET = { x: HEAD.x, y: HEAD.y, r: 0.27, neck: 0.2, collar: { w: 0.42, h: 0.065 } }
/** The middle of the floating figure, which a tap somersaults it about (metres above the floor, at the friend's size). */
const ASTRONAUT_MIDDLE = 0.6

/**
 * A friend floating in a round glass helmet with an air tank on their back, drifting up and
 * down (the rig's float pose). A tap: a slow somersault with a happy face, and back.
 */
const astronaut: ItemDraw = (ctx, t, play) => {
  const flip = active(play, 1.4) ? smooth(0, 1.3, play) : 0
  const rig: Rig = flip > 0 ? { ...posed('float', t), eyes: 'happy', mouth: true } : posed('float', t)
  ctx.save()
  ctx.lineJoin = 'round'
  groundShadow(ctx, 0.5 * ASTRONAUT.k * clamp01(1 + rig.lift * 1.5))
  ctx.translate(0, -ASTRONAUT_MIDDLE)
  ctx.rotate(TAU * flip)
  ctx.translate(0, ASTRONAUT_MIDDLE)
  scaled(ctx, ASTRONAUT.k, () => {
    inRig(ctx, rig, 'upper', () => {
      roundRectPath(ctx, -0.29, -0.68, 0.15, 0.32, 0.07)
      part(ctx, KIT.tank, 'line')
      roundRectPath(ctx, -0.26, -0.72, 0.09, 0.05, 0.02)
      part(ctx, KIT.red, 'line')
    })
    drawRig(ctx, ASTRONAUT.look, rig)
    inRig(ctx, rig, 'upper', () => {
      const { x, y, r, neck, collar } = HELMET
      const cut = Math.asin(neck / r)
      ctx.beginPath()
      ctx.arc(x, y, r, cut, Math.PI - cut, true)
      ctx.closePath()
      part(ctx, KIT.helmet, 'line')
      shine(ctx, x, y, r)
      roundRectPath(ctx, x - collar.w / 2, y + neck - collar.h / 2, collar.w, collar.h, collar.h / 2)
      part(ctx, BOX.steel.top, 'line')
    })
  })
  ctx.restore()
}

/** The robot's arms: shoulder and hand, [far, near], at rest and raised in a tap's cheer. */
const ARMS = {
  rest: [
    [-0.23, -0.62, -0.33, -0.4],
    [0.17, -0.62, 0.3, -0.4],
  ],
  up: [
    [-0.23, -0.62, -0.36, -0.86],
    [0.17, -0.62, 0.32, -0.88],
  ],
} as const

/** One robot arm from its shoulder to a pincer hand, `k` of the way from rest to raised. */
function robotArm(ctx: CanvasRenderingContext2D, side: 0 | 1, k: number) {
  const [sx, sy, rx, ry] = ARMS.rest[side]
  const [, , ux, uy] = ARMS.up[side]
  const hx = mix(rx, ux, k)
  const hy = mix(ry, uy, k)
  ctx.beginPath()
  ctx.moveTo(sx, sy)
  ctx.lineTo(hx, hy)
  tube(ctx, 0.045, side === 0 ? BOX.steel.face : BOX.steel.top)
  // The pincer: a ring open on the side away from the body.
  const a = Math.atan2(hy - sy, hx - sx)
  ctx.beginPath()
  ctx.arc(hx + Math.cos(a) * 0.035, hy + Math.sin(a) * 0.035, 0.04, a + 0.7, a + TAU - 0.7)
  ctx.lineCap = 'round'
  tube(ctx, 0.022, side === 0 ? BOX.steel.face : BOX.steel.top)
}

/**
 * A toy robot: a blue box body with a chest plate of three lights taking turns, box legs, a
 * box head with a dark visor where a wave of light drifts (a visor, not a face), and an
 * antenna whose ball blinks. A tap: arms up, every chest light on, the wave jumps high and
 * the antenna blinks quicker (the renderer hops it).
 */
const robot: ItemDraw = (ctx, t, play) => {
  const full = fine(1.15)
  const tap = active(play, 1.2) ? play : -1
  const cheer = tap >= 0 ? arch(clamp01(tap / 1.1)) : 0
  const blinkOn = tap >= 0 ? loop(tap, 0.7, 0) < 0.5 : loop(t, 1.3, 0) < 0.5
  const turn = Math.floor(loop(t, 2.1, 0) * 3)
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  groundShadow(ctx, 0.56)
  robotArm(ctx, 0, cheer)
  for (const x of [-0.13, 0.09]) {
    ctx.beginPath()
    ctx.moveTo(x, -0.32)
    ctx.lineTo(x, -0.08)
    tube(ctx, 0.07, BOX.steel.face)
    roundRectPath(ctx, x - 0.08, -0.08, 0.16, 0.08, 0.035)
    part(ctx, BOX.steel.side, 'line')
  }
  box(ctx, -0.25, -0.72, 0.44, 0.42, FACES.robot, 0.07, true, true, 'line')
  roundRectPath(ctx, -0.18, -0.66, 0.3, 0.26, 0.04)
  part(ctx, KIT.plate, 'line')
  KIT.lamps.forEach((lit, i) => {
    circlePath(ctx, -0.11 + i * 0.08, -0.59, 0.028)
    part(ctx, cheer > 0.2 || i === turn ? lit : KIT.lampOff, 'detail')
  })
  if (full) {
    ctx.beginPath()
    for (let i = 0; i < 3; i++) {
      ctx.moveTo(-0.11, -0.52 + i * 0.035)
      ctx.lineTo(0.05, -0.52 + i * 0.035)
    }
    ink(ctx, 'detail')
  }
  // The neck, the head, the visor with its wave of light.
  ctx.beginPath()
  ctx.moveTo(-0.01, -0.76)
  ctx.lineTo(-0.01, -0.8)
  tube(ctx, 0.07, BOX.steel.face)
  box(ctx, -0.17, -1.0, 0.32, 0.22, FACES.robot, 0.06, true, true, 'line')
  roundRectPath(ctx, -0.13, -0.96, 0.24, 0.13, 0.05)
  part(ctx, KIT.visor, 'line')
  const amp = 0.018 + 0.028 * cheer
  ctx.beginPath()
  for (let i = 0; i <= 16; i++) {
    const x = -0.1 + (i / 16) * 0.18
    const y = -0.895 + amp * Math.sin(TAU * (i / 8 - loop(t, 1.6, 0)))
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.lineWidth = Math.max(lw('line'), 0.016)
  ctx.strokeStyle = KIT.wave
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(0.02, -1.04)
  ctx.lineTo(0.02, -1.1)
  tube(ctx, 0.016, BOX.steel.top)
  circlePath(ctx, 0.02, -1.12, 0.035)
  part(ctx, blinkOn ? KIT.antennaOn : KIT.antennaOff, 'line')
  if (blinkOn) shine(ctx, 0.02, -1.12, 0.035)
  robotArm(ctx, 1, cheer)
  ctx.restore()
}

// ---------------------------------------------------------------------------------------
// Sauna

/** The sauna boards' width, and the knots' grid: about five knots to a cell, each with its grain swirling round it. */
const BOARD = 0.18
const KNOT_STEP = { x: 0.84, y: 0.66 }

const saunaWall: WallDraw = (ctx, w, h, t, variant) => {
  void t
  const c = SAUNA_WALLS[variant]
  ctx.save()
  ctx.fillStyle = c.base
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = c.alt
  for (let i = 1; i * BOARD < w; i += 2) ctx.fillRect(i * BOARD, 0, BOARD, h)
  // Knots, each in the middle of a board, the grain flowing round it in long rings.
  ctx.fillStyle = c.knot
  ctx.strokeStyle = c.knot
  scatter(w, h, KNOT_STEP, (x, y, col, row) => {
    const bx = (Math.floor(x / BOARD) + 0.5) * BOARD
    const s = 0.8 + 0.1 * pick(col, row, 4)
    ctx.save()
    ctx.beginPath()
    ctx.rect(bx - BOARD / 2, y - 0.3, BOARD, 0.6)
    ctx.clip()
    ctx.beginPath()
    ctx.ellipse(bx, y, 0.035 * s, 0.05 * s, 0, 0, TAU)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(bx, y, 0.06 * s, 0.13 * s, 0, 0, TAU)
    ctx.moveTo(bx + 0.08 * s, y)
    ctx.ellipse(bx, y, 0.08 * s, 0.22 * s, 0, 0, TAU)
    ctx.lineWidth = 0.014
    ctx.stroke()
    ctx.restore()
  })
  ctx.fillStyle = c.groove
  for (let i = 1; i * BOARD < w; i++) ctx.fillRect(i * BOARD - 0.008, 0, 0.016, h)
  ctx.restore()
}

/** The duckboard's slats: each SLAT long with a gap between, in two rows laid half a slat apart. */
const SLAT = 0.6
const SLAT_GAP = 0.03

const saunaFloor: FloorDraw = (ctx, w, t, variant) => {
  void t
  const c = SAUNA_FLOORS[variant]
  const rows = [
    [0.012, 0.064, 0],
    [0.084, 0.07, SLAT / 2],
  ] as const
  ctx.save()
  ctx.fillStyle = c.gap
  ctx.fillRect(0, 0, w, FLOOR_BAND)
  ctx.fillStyle = c.slat
  for (const [y, h, shift] of rows) for (let x = -shift; x < w; x += SLAT) ctx.fillRect(x + SLAT_GAP / 2, y, SLAT - SLAT_GAP, h)
  ctx.fillStyle = c.edge
  ctx.fillRect(0, FLOOR_BAND - EDGE - 0.01, w, EDGE + 0.01)
  ctx.restore()
}

/** The lantern from its ceiling anchor: the cord's length, the wooden box's front (left, top, width, height), its depth. */
const LANTERN = { cord: 0.13, x: -0.15, y: 0.17, w: 0.28, h: 0.28, d: 0.045 }

/**
 * A warm wooden sauna lantern on a cord: a box of wooden slats with a soft light inside and
 * a glow round it that breathes slowly. A tap makes it glow brighter for a moment (the
 * renderer grows it).
 */
const saunaLamp: ItemDraw = (ctx, t, play) => {
  const full = fine(0.6)
  const bright = active(play, 1.1) ? arch(clamp01(play / 1.0)) : 0
  const L = LANTERN
  const cx = L.x + L.w / 2
  const cy = L.y + L.h / 2
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  circlePath(ctx, cx, cy, 0.27 * (1 + 0.04 * Math.sin(TAU * loop(t, 3, 0)) + 0.18 * bright))
  ctx.fillStyle = C.light
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(cx, 0)
  ctx.lineTo(cx, L.cord)
  tube(ctx, 0.016, C.rope)
  box(ctx, L.x - 0.02, L.cord, L.w + 0.04, L.y - L.cord, FACES.lantern, L.d, true, true, 'line')
  box(ctx, L.x, L.y, L.w, L.h, { ...FACES.lantern, face: KIT.lanternLight }, L.d, false, true, 'line')
  // The slats over the light, and the bottom cap.
  const slats = full ? 4 : 3
  for (let i = 0; i < slats; i++) {
    const x = L.x + ((i + 0.5) * L.w) / slats - 0.02
    ctx.beginPath()
    ctx.rect(x, L.y, 0.04, L.h)
    part(ctx, FACES.lantern.face, 'detail')
  }
  box(ctx, L.x - 0.02, L.y + L.h, L.w + 0.04, 0.045, FACES.lantern, L.d, false, true, 'line')
  circlePath(ctx, cx, L.y + L.h + 0.075, 0.025)
  part(ctx, FACES.lantern.face, 'line')
  ctx.restore()
}

/** The vihta's leafy part, from the slot's centre: a fan narrow at the handle and round at the bottom; the leaves over it in rows from the top down, [x, y, angle] (the angle a leaf points, 0 right and PI/2 down). */
const FAN = { top: -0.08, side: 0.18, bottom: 0.27 }
const WHISK_LEAVES = [
  [-0.03, -0.05, 2.2],
  [0.03, -0.05, 0.95],
  [-0.08, 0.02, 2.3],
  [0.0, 0.03, 1.6],
  [0.08, 0.02, 0.85],
  [-0.13, 0.09, 2.25],
  [-0.05, 0.1, 1.85],
  [0.05, 0.1, 1.3],
  [0.13, 0.09, 0.9],
  [-0.15, 0.16, 2.0],
  [-0.06, 0.18, 1.75],
  [0.04, 0.18, 1.45],
  [0.14, 0.16, 1.1],
] as const
/** The two leaves a tap shakes loose: where they start, which way they drift. */
const LOOSE = [
  [-0.17, 0.12, -1],
  [0.16, 0.14, 1],
] as const

/** The vihta's leafy fan as one silhouette, scalloped like the leaves along its edge: what shows behind the single leaves, and all that shows when it is small. */
function fanPath(ctx: CanvasRenderingContext2D) {
  const { top, side, bottom } = FAN
  const rim = [
    [side * 0.55, top + 0.08],
    [side, top + 0.2],
    [side * 0.95, bottom - 0.07],
    [side * 0.5, bottom],
    [-side * 0.5, bottom],
    [-side * 0.95, bottom - 0.07],
    [-side, top + 0.2],
    [-side * 0.55, top + 0.08],
    [0, top],
  ] as const
  // Each scallop bulges out from the fan's middle.
  const cy = (top + bottom) / 2
  ctx.beginPath()
  ctx.moveTo(0, top)
  let [px, py] = [0, top]
  for (const [x, y] of rim) {
    ctx.quadraticCurveTo(((px + x) / 2) * 1.3, cy + ((py + y) / 2 - cy) * 1.3, x, y)
    px = x
    py = y
  }
  ctx.closePath()
}

/** A birch leaf, pointed and toothless at this size, `len` long, its stalk at the origin pointing along `angle`. */
function birchLeaf(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, len: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.bezierCurveTo(len * 0.25, -len * 0.5, len * 0.75, -len * 0.4, len, 0)
  ctx.bezierCurveTo(len * 0.75, len * 0.4, len * 0.25, len * 0.5, 0, 0)
  ctx.closePath()
  part(ctx, KIT.leaf, 'detail')
  ctx.restore()
}

/**
 * The vihta: a bundle of birch twigs, its handle wrapped in twine, hung by a loop from a
 * wooden peg; leafy and green at the bottom, rustling now and then (the renderer sways it).
 * A tap shakes it, and two leaves come loose, flutter down and shrink away.
 */
const birchWhisk: ItemDraw = (ctx, t, play) => {
  const full = fine(0.6)
  const rustle = 0.12 * Math.sin(TAU * loop(t, 2.3, 0.1))
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-0.03, -0.27)
  ctx.lineTo(-0.022, -0.2)
  ctx.moveTo(0.03, -0.27)
  ctx.lineTo(0.022, -0.2)
  tube(ctx, 0.01, KIT.twine)
  circlePath(ctx, 0, -0.275, 0.035)
  part(ctx, KIT.peg, 'line')
  // The leaves hang in a fan that widens to the bottom, each one pointing down and out, over the twigs.
  fanPath(ctx)
  part(ctx, full ? KIT.leafDark : KIT.leaf, 'line')
  if (full) {
    ctx.beginPath()
    for (const dx of [-0.12, -0.05, 0.03, 0.1]) {
      ctx.moveTo(0, FAN.top)
      ctx.quadraticCurveTo(dx * 0.5, 0.08, dx, FAN.bottom - 0.04)
    }
    ctx.lineWidth = 0.012
    ctx.strokeStyle = KIT.twig
    ctx.stroke()
    WHISK_LEAVES.forEach(([x, y, a], i) => birchLeaf(ctx, x, y, a + rustle * (i % 2 === 0 ? 1 : -1) * 0.4, 0.1))
  }
  roundRectPath(ctx, -0.03, -0.21, 0.06, 0.16, 0.025)
  part(ctx, KIT.twig, 'line')
  for (const y of [-0.18, -0.1]) {
    roundRectPath(ctx, -0.038, y, 0.076, 0.028, 0.012)
    part(ctx, KIT.twine, 'detail')
  }
  if (active(play, 1.4)) {
    const u = clamp01(play / 1.3)
    for (const [x, y, side] of LOOSE) {
      const len = 0.075 * (1 - smooth(0.55, 1, u))
      if (!speck(len / 2)) birchLeaf(ctx, x + side * 0.13 * u + 0.03 * Math.sin(TAU * 1.6 * u), y + 0.1 * u, side * (1 + 3 * u), len)
    }
  }
  ctx.restore()
}

/** The kiuas's body (left, top, width, height, depth), its fire door, the slotted steel band of the stone basket on top, and the stones piled in it: [x, y, rx, ry, shade]. */
const STOVE = { x: -0.3, y: -0.6, w: 0.5, h: 0.52, d: 0.12 }
const DOOR = { x: -0.22, y: -0.4, w: 0.3, h: 0.22 }
const BASKET = { x: -0.32, y: -0.72, w: 0.54, h: 0.14 }
const STONES = [
  [-0.24, -0.65, 0.07, 0.055, 1],
  [-0.11, -0.66, 0.075, 0.06, 0],
  [0.03, -0.65, 0.07, 0.055, 2],
  [0.15, -0.66, 0.065, 0.055, 1],
  [0.27, -0.72, 0.06, 0.05, 0],
  [-0.18, -0.75, 0.07, 0.055, 2],
  [-0.04, -0.77, 0.075, 0.06, 1],
  [0.1, -0.76, 0.07, 0.055, 0],
  [0.22, -0.8, 0.06, 0.05, 2],
  [-0.1, -0.86, 0.065, 0.05, 0],
  [0.04, -0.87, 0.065, 0.05, 2],
] as const
/** The steam a tap raises: each puff's x, delay and size; and the drops of water thrown on first. */
const STEAM = [
  [-0.16, 0.12, 0.12],
  [0.12, 0.18, 0.13],
  [-0.02, 0.26, 0.15],
  [0.24, 0.34, 0.1],
  [-0.24, 0.4, 0.1],
  [0.06, 0.5, 0.12],
] as const
const THROWN = [
  [-0.3, 0.5, 0.024],
  [-0.12, 0.7, 0.028],
  [0.05, 0.55, 0.022],
] as const

/** The fire through the stove's door window: three tongues of flame that sway and stretch, never flashing. */
function fire(ctx: CanvasRenderingContext2D, t: number, x: number, y: number, w: number, h: number) {
  ctx.save()
  roundRectPath(ctx, x, y, w, h, 0.03)
  ctx.fillStyle = KIT.fireBack
  ctx.fill()
  ctx.clip()
  for (const [colour, k] of [
    [KIT.fire, 1],
    [KIT.fireHot, 0.6],
  ] as const) {
    ctx.beginPath()
    for (let i = 0; i < 3; i++) {
      const fx = x + w * (0.22 + 0.28 * i)
      const tall = h * k * (0.75 + 0.2 * Math.sin(TAU * loop(t, 1.3 + 0.2 * i, 0.3 * i)))
      const lean = 0.02 * Math.sin(TAU * loop(t, 1.7, 0.2 * i))
      const half = w * 0.16 * k
      ctx.moveTo(fx - half, y + h)
      ctx.quadraticCurveTo(fx - half, y + h - tall * 0.5, fx + lean, y + h - tall)
      ctx.quadraticCurveTo(fx + half, y + h - tall * 0.5, fx + half, y + h)
      ctx.closePath()
    }
    ctx.fillStyle = colour
    ctx.fill()
  }
  ctx.restore()
  roundRectPath(ctx, x, y, w, h, 0.03)
  ink(ctx, 'detail')
}

/**
 * The kiuas: a black steel stove on little feet, the fire flickering behind its door, a
 * basket of round stones on top, a wisp of heat rising off them now and then. A tap throws a
 * ladle of water on the stones: they sizzle and a big soft cloud of steam rolls up (the
 * löyly), grows and melts away.
 */
const kiuas: ItemDraw = (ctx, t, play) => {
  const full = fine(1.15)
  const tap = active(play, 1.6) ? play : -1
  const sizzle = tap > 0.15 && tap < 0.6 ? 0.008 * Math.sin(TAU * 8 * tap) : 0
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  groundShadow(ctx, 0.72)
  for (const x of [-0.25, 0.12]) {
    roundRectPath(ctx, x, -0.1, 0.08, 0.1, 0.02)
    part(ctx, FACES.stove.side, 'line')
  }
  box(ctx, STOVE.x, STOVE.y, STOVE.w, STOVE.h, FACES.stove, STOVE.d, true, true, 'line')
  roundRectPath(ctx, DOOR.x, DOOR.y, DOOR.w, DOOR.h, 0.04)
  part(ctx, BOX.steel.side, 'line')
  fire(ctx, t, DOOR.x + 0.035, DOOR.y + 0.035, DOOR.w - 0.07, DOOR.h - 0.07)
  if (full) {
    roundRectPath(ctx, DOOR.x + DOOR.w + 0.02, DOOR.y + 0.06, 0.04, 0.1, 0.015)
    part(ctx, BOX.steel.top, 'detail')
  }
  // The stones in their steel basket.
  ctx.save()
  ctx.translate(0, sizzle)
  for (const [x, y, rx, ry, shade] of STONES) {
    ctx.beginPath()
    ctx.ellipse(x, y, rx, ry, 0, 0, TAU)
    part(ctx, KIT.stones[shade], 'line')
  }
  ctx.restore()
  // The basket's slotted steel band round the bottom stones.
  box(ctx, BASKET.x, BASKET.y, BASKET.w, BASKET.h, FACES.basket, STOVE.d, false, true, 'line')
  if (full) {
    ctx.beginPath()
    for (let i = 1; i < 6; i++) {
      const x = BASKET.x + (i * BASKET.w) / 6
      ctx.moveTo(x, BASKET.y + 0.025)
      ctx.lineTo(x, BASKET.y + BASKET.h - 0.025)
    }
    ctx.lineWidth = 0.022
    ctx.strokeStyle = FACES.basket.side
    ctx.stroke()
  }
  if (tap < 0) {
    // A wisp of heat off the stones every few seconds.
    const u = loop(t, 4.2, 0.3)
    if (u < 0.6) puff(ctx, 0.05 + 0.04 * u, -0.92 - 0.14 * u, 0.045 * arch(u / 0.6), KIT.steam)
  } else {
    splash(ctx, -0.02, -1.0, tap, THROWN, 0.22)
    for (const [x, delay, r] of STEAM) {
      const u = clamp01((tap - delay) / 1.05)
      if (u > 0 && u < 1) puff(ctx, x + 0.06 * Math.sin(TAU * 0.6 * u + x * 9), -0.86 - 0.24 * smooth(0, 1, u), r * Math.sin(Math.PI * u), KIT.steam)
    }
  }
  ctx.restore()
}

/** The sauna bench (laude): its seat's front (left, top, width), the seat's thickness and the depth its top recedes, the legs' width, the footrest's height. */
const BENCH = { x: -0.47, top: -0.44, w: 0.8, seat: 0.07, d: 0.15, leg: 0.07, step: -0.16 }
/** The friend on the bench: which friend, their size, where they sit along it. */
const SAUNA_KID = { look: FRIENDS[0]!, k: 0.9, x: -0.13 }
/** Sitting on the bench's edge as on a seat: the hips this high above the feet, thighs out, shins hanging (the rig's drive legs). Their seat is SEAT_DROP below the hips. */
const PERCH = { hip: -0.19, thigh: [1.45, 1.5], knee: [1.45, 1.5] } as const
const SEAT_DROP = 0.055

/** The outline of the big towel wrapped round the friend from the chin to the knees, in the rig's standing measures (sitting on the bench, hips at PERCH.hip): narrow at the shoulders, round over the knees. */
function towelWrapPath(ctx: CanvasRenderingContext2D) {
  ctx.beginPath()
  ctx.moveTo(-0.03, -0.51)
  ctx.bezierCurveTo(-0.12, -0.5, -0.17, -0.45, -0.19, -0.36)
  ctx.bezierCurveTo(-0.22, -0.26, -0.24, -0.16, -0.2, -0.13)
  ctx.lineTo(0.25, -0.13)
  ctx.quadraticCurveTo(0.33, -0.14, 0.33, -0.21)
  ctx.quadraticCurveTo(0.33, -0.28, 0.24, -0.29)
  ctx.lineTo(0.2, -0.3)
  ctx.bezierCurveTo(0.2, -0.41, 0.15, -0.5, 0.07, -0.51)
  ctx.closePath()
}
/** The big towel round the friend: two stripes running round it, its corner tucked in at the chest. */
function wrapTowel(ctx: CanvasRenderingContext2D, full: boolean) {
  towelWrapPath(ctx)
  ctx.fillStyle = KIT.kidTowel
  ctx.fill()
  ctx.save()
  ctx.clip()
  // Two stripes running round the body, curved to show it is round.
  ctx.beginPath()
  for (const y of [-0.42, -0.23]) {
    ctx.moveTo(-0.26, y)
    ctx.quadraticCurveTo(0.04, y + 0.06, 0.36, y)
  }
  ctx.lineWidth = 0.032
  ctx.strokeStyle = KIT.kidTowelStripe
  ctx.stroke()
  ctx.restore()
  towelWrapPath(ctx)
  ink(ctx, 'line')
  if (full) {
    // The corner tucked in at the chest.
    ctx.beginPath()
    ctx.moveTo(0.0, -0.49)
    ctx.quadraticCurveTo(0.08, -0.4, 0.19, -0.37)
    ctx.lineCap = 'round'
    ink(ctx, 'detail')
  }
}

/**
 * A friend wrapped up to the chin in a big striped towel, sitting on the sauna bench
 * (laude) on a little seat towel (pefletti), legs dangling over the footrest, warm and
 * content. A tap: a hand pops out of the towel to wave, with a giggle and two little
 * bounces, then back to sitting.
 */
const saunaKid: ItemDraw = (ctx, t, play) => {
  const full = fine(1.15)
  const tap = active(play, 1.2) ? play : -1
  const sit = { ...posed('sit', t), ...PERCH }
  // A tap: the rig's wave, the near hand popping out of the towel, with two little bounces.
  const wave = posed('wave', tap)
  const rig: Rig =
    tap >= 0
      ? { ...sit, shoulder: wave.shoulder, elbow: wave.elbow, lift: -0.05 * Math.abs(Math.sin(TAU * 0.85 * tap)) * (1 - tap / 1.2), eyes: 'happy', mouth: true }
      : sit
  const B = BENCH
  const under = B.top + B.seat
  ctx.save()
  ctx.lineJoin = 'round'
  groundShadow(ctx, 0.92)
  // The shade under the seat, the legs at its ends, the footrest between them.
  ctx.beginPath()
  ctx.rect(B.x + B.leg, under, B.w - 2 * B.leg, -under)
  ctx.fillStyle = KIT.benchShade
  ctx.fill()
  for (const x of [B.x, B.x + B.w - B.leg]) box(ctx, x, under, B.leg, -under, FACES.bench, 0.04, false, true, 'line')
  box(ctx, B.x + B.leg, B.step, B.w - 2 * B.leg, 0.05, FACES.bench, 0.04, true, false, 'line')
  box(ctx, B.x - 0.02, B.top, B.w + 0.04, B.seat, FACES.bench, B.d, true, true, 'line')
  if (full) {
    // The seat's slats along its top.
    ctx.beginPath()
    for (const k of [0.33, 0.66]) {
      ctx.moveTo(B.x - 0.02 + B.d * k, B.top - B.d * k)
      ctx.lineTo(B.x + B.w + 0.02 + B.d * k, B.top - B.d * k)
    }
    ink(ctx, 'detail')
  }
  // The pefletti on the seat, its front edge hanging over.
  const px = SAUNA_KID.x
  ctx.beginPath()
  ctx.moveTo(px - 0.2, B.top + 0.05)
  ctx.lineTo(px - 0.2, B.top)
  ctx.lineTo(px - 0.2 + B.d * 0.8, B.top - B.d * 0.8)
  ctx.lineTo(px + 0.2 + B.d * 0.8, B.top - B.d * 0.8)
  ctx.lineTo(px + 0.2, B.top)
  ctx.lineTo(px + 0.2, B.top + 0.05)
  ctx.closePath()
  part(ctx, KIT.pefletti, 'detail')
  // The friend squashes and stretches about their seat on the bench.
  ctx.save()
  ctx.translate(px, B.top)
  if (tap >= 0 && tap < 0.25) {
    const [sx, sy] = squash(tap * 2)
    ctx.scale(sx, sy)
  }
  ctx.translate(0, -(PERCH.hip + SEAT_DROP) * SAUNA_KID.k)
  scaled(ctx, SAUNA_KID.k, () => {
    drawRig(ctx, SAUNA_KID.look, rig)
    inRig(ctx, rig, 'body', () => wrapTowel(ctx, full))
  })
  ctx.restore()
  ctx.restore()
}

/** The bucket (kiulu): its rim's half width, height and seen-from-above depth, its foot's half width. The ladle (kauha): where its cup rests in the water and where a tap lifts it, how far it tips to pour, its cup's radius and its handle's end from the cup. */
const BUCKET = { rim: 0.22, top: -0.42, foot: 0.18, ry: 0.055 }
const LADLE = { rest: { x: 0.04, y: -0.38 }, lift: { x: 0.02, y: -0.62 }, tip: 0.9, cup: 0.075, handle: [-0.24, -0.52] as const }
/** The splash back into the bucket when the ladle pours: [vx, vy, r]. */
const BUCKET_SPLASH = [
  [-0.4, -1.3, 0.022],
  [-0.15, -1.6, 0.026],
  [0.12, -1.55, 0.024],
  [0.38, -1.25, 0.02],
] as const

/** Where the ladle is `play` seconds after a tap: lifted out full, tipped to pour over its front lip, and back in its rest. Returns [x, y, angle, pour, full] with pour 0 to 1 while water runs, and whether the cup still holds its water. */
function ladleAt(play: number): [number, number, number, number, boolean] {
  const { rest, lift } = LADLE
  if (!active(play, 1.3)) return [rest.x, rest.y, 0, 0, false]
  const up = smooth(0, 0.3, play) * (1 - smooth(0.8, 1.2, play))
  const tip = smooth(0.28, 0.45, play) * (1 - smooth(0.7, 0.9, play))
  return [mix(rest.x, lift.x, up), mix(rest.y, lift.y, up), LADLE.tip * tip, tip, play < 0.4]
}

/** The ladle with its cup at the origin, the long handle reaching up and back; `water` fills the cup to its brim. */
function drawLadle(ctx: CanvasRenderingContext2D, water: boolean) {
  const [hx, hy] = LADLE.handle
  ctx.beginPath()
  ctx.moveTo(-0.05, -0.02)
  ctx.lineTo(hx, hy)
  ctx.lineCap = 'round'
  tube(ctx, 0.03, FACES.bucket.top)
  ctx.beginPath()
  ctx.moveTo(-LADLE.cup, 0)
  ctx.quadraticCurveTo(-LADLE.cup, LADLE.cup * 1.1, 0, LADLE.cup * 1.1)
  ctx.quadraticCurveTo(LADLE.cup, LADLE.cup * 1.1, LADLE.cup, 0)
  ctx.closePath()
  part(ctx, FACES.bucket.face, 'line')
  if (water) {
    ctx.beginPath()
    ctx.ellipse(0, 0.005, LADLE.cup * 0.85, 0.018, 0, 0, TAU)
    part(ctx, KIT.water, 'detail')
  }
}

/**
 * The wooden sauna bucket with copper hoops, full of water, the long-handled ladle resting
 * in it. A tap lifts the ladle out, tips it so the water pours back in, and the water
 * splashes up out of the bucket; then the ladle settles back.
 */
const bucket: ItemDraw = (ctx, t, play) => {
  void t
  const full = fine(1.15)
  const B = BUCKET
  const [lx, ly, la, pour, brim] = ladleAt(play)
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  groundShadow(ctx, 0.52)
  ctx.beginPath()
  ctx.ellipse(0, B.top, B.rim, B.ry, 0, 0, TAU)
  part(ctx, KIT.bucketInside, 'line')
  ctx.beginPath()
  ctx.ellipse(0, B.top + 0.012, B.rim - 0.03, B.ry - 0.014, 0, 0, TAU)
  ctx.fillStyle = KIT.water
  ctx.fill()
  ctx.save()
  ctx.translate(lx, ly)
  ctx.rotate(la)
  drawLadle(ctx, brim)
  ctx.restore()
  // The staves' front, its top edge the near half of the rim.
  ctx.beginPath()
  ctx.ellipse(0, B.top, B.rim, B.ry, 0, Math.PI, 0, true)
  ctx.lineTo(B.foot, 0)
  ctx.lineTo(-B.foot, 0)
  ctx.closePath()
  part(ctx, FACES.bucket.face, 'line')
  if (full) {
    ctx.beginPath()
    for (const k of [-0.5, 0, 0.5]) {
      ctx.moveTo(k * B.rim, B.top + B.ry * Math.sqrt(1 - k * k))
      ctx.lineTo(k * B.foot, 0)
    }
    ctx.lineWidth = lw('detail')
    ctx.strokeStyle = FACES.bucket.side
    ctx.stroke()
  }
  for (const y of [-0.34, -0.1]) {
    const half = mix(B.foot, B.rim, -y / -B.top)
    ctx.beginPath()
    ctx.moveTo(-half, y - 0.02)
    ctx.quadraticCurveTo(0, y - 0.02 + B.ry, half, y - 0.02)
    ctx.lineTo(half, y + 0.02)
    ctx.quadraticCurveTo(0, y + 0.02 + B.ry, -half, y + 0.02)
    ctx.closePath()
    part(ctx, KIT.hoop, 'detail')
  }
  if (pour > 0.3) {
    // The water running out of the tipped cup.
    const [cx, cy] = [lx + Math.cos(la) * LADLE.cup, ly + Math.sin(la) * LADLE.cup]
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.quadraticCurveTo(cx + 0.04, cy + 0.1, cx + 0.03, B.top)
    ctx.lineWidth = 0.03 * pour
    ctx.strokeStyle = KIT.water
    ctx.stroke()
  }
  splash(ctx, 0.02, B.top, play - 0.45, BUCKET_SPLASH, 0.6)
  ctx.restore()
}

// ---------------------------------------------------------------------------------------

export const WONDER_ART: { [T in 'bath' | 'space' | 'sauna']: ThemeArt<T> } = {
  bath: {
    wall: bathWall,
    floor: bathFloor,
    glow: GLOW.bath,
    swatches: [BATH_WALLS[0].base, BATH_WALLS[1].base, BATH_WALLS[2].base, BATH_WALLS[3].base],
    items: { bubbleLamp, towelRack, bathtub, bigDuck, toilet },
  },
  space: {
    wall: spaceWall,
    floor: spaceFloor,
    glow: GLOW.space,
    swatches: [SPACE_WALLS[0].base, SPACE_WALLS[1].base, SPACE_WALLS[2].base, SPACE_WALLS[3].base],
    items: { planets, starWindow, rocket, astronaut, robot },
  },
  sauna: {
    wall: saunaWall,
    floor: saunaFloor,
    glow: GLOW.sauna,
    swatches: [SAUNA_WALLS[0].base, SAUNA_WALLS[1].base, SAUNA_WALLS[2].base, SAUNA_WALLS[3].base],
    items: { saunaLamp, birchWhisk, kiuas, saunaKid, bucket },
  },
}
