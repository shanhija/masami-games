import type { View } from '../game/camera'
import { HOME_COLS, HOUSE_GRID } from '../game/catalog'
import { CELL, DEPTH, GARAGE_W, HOUSE_X, LIFT_W, MIRROR_X, PLOTS_X, PLOT_W, STATION_W, TRUCK_HOME_X, rect, stationLeft } from '../game/layout'
import { MACHINES, type HouseKind } from '../game/model'
import { BULLDOZE } from './effects'
import { HOME_DOORS } from './house'
import {
  BOX,
  C,
  HAT_LOOK,
  INK,
  MATERIAL_LOOK,
  RAW_LOOK,
  SKY,
  TAU,
  arch,
  blob,
  box,
  circlePath,
  clamp01,
  detail,
  flatSun,
  groundShadow,
  heldAge,
  ink,
  loop,
  lw,
  mix,
  part,
  pen,
  phaseOf,
  puff,
  roundRectPath,
  shine,
  smooth,
  sparklePath,
  squash,
  tube,
  type Faces,
  type SheetEntry,
} from './look'

/**
 * The street's world: the sky and backdrop (day to evening), the ground (the lot everything
 * stands on, the pavement, the road in front, the street lamps), the garage with its big
 * door, the mirror, each plot's ground (an empty plot's fenced dirt and its sign, the tall
 * house's playground, the row house's front gardens), the crane that lowers rooms and drops
 * crates, and the bulldozer that levels a new plot.
 *
 * The ground is a cut through a sunny street seen a little from above: its bands are top
 * faces, its marks recede up-right at 45 degrees like every made thing's top face, and only
 * its back edge (the line between the play layer and the backdrop) and the kerb carry ink.
 * The backdrop has no ink at all and stays lighter than the play layer; it is drawn at the
 * square root of the camera's zoom past the street's, so the hills stay far away when the
 * camera goes close.
 */

// ---------------------------------------------------------------------------------------
// The palette

/** The street's own colours beyond look.ts. */
const ST = {
  // The ground: the garage's concrete apron, the yard's packed sand, the pavement, the kerb's face.
  apron: '#DCD8CE',
  apronJoint: '#C6C0B2',
  yard: '#EBDCAE',
  yardDot: '#D3BE86',
  pave: '#E6E9EF',
  paveJoint: C.kerb,
  kerbFace: '#A8B1C3',
  tuft: BOX.grass.side,
  // The backdrop: the far town, its windows at dusk, the trees on the near hills.
  town: '#A6D3EF',
  townWindow: C.sparkleWarm,
  tree: '#74C468',
  pine: '#62B85E',
  trunk: '#C49A70',
  // The street lamps.
  pole: '#3E5A9C',
  bulb: '#FFF8E6',
  bulbLit: C.sparkleWarm,
  // The garage: mint walls with white trims under a cobalt roof, a red side door, the dim inside.
  inside: '#56628E',
  insideSide: '#454F78',
  insideFloor: '#8E96AC',
  insideLit: '#D9A86E',
  insideSideLit: '#B98552',
  insideFloorLit: '#E8C68E',
  board: '#88D2B8',
  peg: '#E9C58F',
  pegHole: '#C99B5F',
  door: '#F05A4B',
  // Flowers, the swings' and the sandbox's red, and the mailboxes' flags: white on every mailbox, which is its home's door colour (house.ts HOME_DOORS).
  petals: ['#FF5A5A', '#FFD93A', '#FF7AB6', C.white, '#A77BFF'],
  stem: '#3F9A3A',
  sandDark: RAW_LOOK.sand.body,
  flag: '#FF5A5A',
  mailFlag: C.white,
  puff: '#ECEEF3',
} as const

/** The garage's mint walls. */
const WALL: Faces = { face: '#9ADBC4', top: '#C2EBDC', side: '#6CBFA4' }
/** The mirror's frame: a cheerful pink, lit on top and dark on its right. */
const FRAME: Faces = { face: '#FF6F96', top: '#FF9DB8', side: '#D9496F' }
/** The sandbox: plank sides and a top of sand. */
const SANDBOX: Faces = { face: MATERIAL_LOOK.planks.face, top: RAW_LOOK.sand.light, side: MATERIAL_LOOK.planks.side }
/** The bushes between the row house's front gardens. */
const BUSH = BOX.grass.side
/** The empty plot's dirt: a very flat box whose deep top face is the lot. */
const DIRT: Faces = BOX.soil

// ---------------------------------------------------------------------------------------
// The ground's measures, in metres down from the line everything stands on (y = 0).

/** The back edge of the ground: the horizon of the play layer, where the backdrop's hills meet it. */
const BACK = -0.5
/** The lot (the band everything stands on, with a strip in front for the front gardens) ends here and the pavement begins. */
const LOT_FRONT = 0.85
/** The pavement's front edge, the kerb's face, the road, and the verge under it all the way down (deep enough for any shot). */
const KERB = 1.25
const ROAD = 1.37
const VERGE = 2.37
const DEEP = 40
/** The road's middle dashes: their middle line, height, length and spacing. */
const LANE = { y: 1.87, h: 0.09, len: 1.3, every: 3.4 }
/** Front-garden things stand here, in the lot's front strip, short enough to stay in front of the house (below its bottom at y = 0). */
const GARDEN_Y = 0.74

/** The street lamps stand on the pavement in gaps where nothing else stands: after every second yard station, and in each plot's right margin. */
const LAMP = { y: (LOT_FRONT + KERB) / 2, h: 3.7, arm: 0.48, half: 0.75, plotIn: PLOT_W - 0.8 }

/** The world x where the yard's sand ends and the plots' lawn begins. */
const LAWN_X = PLOTS_X - 0.5

// ---------------------------------------------------------------------------------------
// Small helpers

/** A stable pseudo-random number in [0, 1) for an integer and a salt: scenery that never changes as the camera pans. */
const rnd = (i: number, salt: number) => {
  const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453
  return s - Math.floor(s)
}

/** Two '#RRGGBB' tokens mixed, k from 0 (a) to 1 (b). */
function mixHex(a: string, b: string, k: number): string {
  const u = clamp01(k)
  const pa = parseInt(a.slice(1), 16)
  const pb = parseInt(b.slice(1), 16)
  const ch = (shift: number) => Math.round(mix((pa >> shift) & 255, (pb >> shift) & 255, u))
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`
}

/**
 * The builder's sign, the cat-ear hard hat as a cut-out: a dome on a brim with its peak to
 * the right, two ears with pink insides and one shine, `w` wide with the brim's bottom at
 * (x, y). Inked at `weight`.
 */
function hatEmblem(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, weight: 'edge' | 'line') {
  const hat = HAT_LOOK.yellow
  const u = w / 2
  const by = y - 0.16 * u
  const rx = 0.62 * u
  const ry = 0.66 * u
  /** One ear from its base (a)-(b) to its rounded tip; the near one is moulded on, with no line along its base. */
  const ear = (ax: number, ay: number, bx: number, byy: number, tx: number, ty: number, near: boolean) => {
    const trace = () => {
      ctx.beginPath()
      ctx.moveTo(ax, ay)
      ctx.lineTo(mix(ax, tx, 0.84), mix(ay, ty, 0.84))
      ctx.quadraticCurveTo(tx, ty, mix(bx, tx, 0.84), mix(byy, ty, 0.84))
      ctx.lineTo(bx, byy)
    }
    trace()
    ctx.closePath()
    ctx.fillStyle = hat.base
    ctx.fill()
    if (near) trace()
    ink(ctx, weight)
    const cx = (ax + bx) / 2
    const cy = (ay + byy) / 2
    ctx.beginPath()
    ctx.moveTo(mix(cx, ax, 0.55), mix(cy, ay, 0.55))
    ctx.quadraticCurveTo(mix(cx, tx, 0.85), mix(cy, ty, 0.85), mix(cx, bx, 0.55), mix(cy, byy, 0.55))
    ctx.closePath()
    ctx.fillStyle = hat.inner
    ctx.fill()
  }
  ctx.save()
  ctx.lineJoin = 'round'
  ear(x - 0.62 * u, by - 0.38 * u, x - 0.1 * u, by - 0.64 * u, x - 0.56 * u, by - 1.12 * u, false)
  ctx.beginPath()
  ctx.ellipse(x, by, rx, ry, 0, Math.PI, TAU)
  ctx.closePath()
  part(ctx, hat.base, weight)
  shine(ctx, x - 0.04 * u, by - 0.02 * u, ry * 0.95)
  roundRectPath(ctx, x - 0.86 * u, by - 0.04 * u, 1.86 * u, 0.2 * u, 0.1 * u)
  part(ctx, hat.base, weight)
  ear(x + 0.1 * u, by - 0.64 * u, x + 0.62 * u, by - 0.38 * u, x + 0.56 * u, by - 1.12 * u, true)
  ctx.restore()
}

/** A flower `size` across on a stem from (x, y) up `h`, leaning `sway`: a tulip for even `i`, a daisy for odd, in petal colour `i`. */
function flower(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, size: number, i: number, sway: number) {
  const hx = x + sway
  const hy = y - h
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.quadraticCurveTo(x, y - h * 0.5, hx, hy)
  ctx.lineCap = 'round'
  tube(ctx, size * 0.16, ST.stem)
  ctx.beginPath()
  ctx.ellipse(x + size * 0.28, y - h * 0.35, size * 0.3, size * 0.12, -0.5, 0, TAU)
  part(ctx, BOX.grass.face, 'detail')
  const colour = ST.petals[i % ST.petals.length]!
  if (i % 2 === 0) {
    // A tulip: a cup with three points.
    const r = size / 2
    ctx.beginPath()
    ctx.moveTo(hx - r, hy - r * 0.5)
    ctx.lineTo(hx - r * 0.45, hy - r * 0.05)
    ctx.lineTo(hx, hy - r * 0.6)
    ctx.lineTo(hx + r * 0.45, hy - r * 0.05)
    ctx.lineTo(hx + r, hy - r * 0.5)
    ctx.quadraticCurveTo(hx + r, hy + r * 0.8, hx, hy + r * 0.8)
    ctx.quadraticCurveTo(hx - r, hy + r * 0.8, hx - r, hy - r * 0.5)
    ctx.closePath()
    part(ctx, colour, 'detail')
  } else {
    // A daisy: five round petals round a yellow middle.
    const r = size / 2
    ctx.beginPath()
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * TAU - Math.PI / 2
      const px = hx + Math.cos(a) * r * 0.55
      const py = hy + Math.sin(a) * r * 0.55
      ctx.moveTo(px + r * 0.45, py)
      ctx.arc(px, py, r * 0.45, 0, TAU)
    }
    part(ctx, colour === ST.petals[1] ? C.white : colour, 'detail')
    circlePath(ctx, hx, hy, r * 0.32)
    part(ctx, ST.petals[1], 'detail')
  }
}

// ---------------------------------------------------------------------------------------
// The backdrop

/** The backdrop's CSS px per metre at the street's zoom: a closer camera grows it only by the square root, so the far things stay far. */
const BACKDROP_PPM = 42
/** The sky's five flat bands: each begins this many backdrop metres over the horizon (the first one at the top of the screen). */
const BAND_FROM = [Infinity, 13, 9.6, 6.6, 3.6] as const
/** How far each layer moves as the camera pans: the clouds, the town, the far hills, the near hills. */
const PARALLAX = { cloud: 0.06, town: 0.12, far: 0.2, near: 0.34 } as const
/** The clouds drift this many backdrop metres a second, and come round again every CLOUD_LOOP metres. */
const CLOUD_DRIFT = 0.12
const CLOUD_LOOP = 90
/** Each cloud: where it is in its loop, its height over the horizon, its size. */
const CLOUDS = [
  [4, 11.2, 1.0],
  [17, 8.4, 0.75],
  [29, 12.6, 1.15],
  [43, 9.6, 0.85],
  [56, 12.0, 0.7],
  [68, 8.0, 1.05],
  [80, 10.8, 0.8],
] as const
/** The town's buildings stand in cells TOWN_CELL backdrop metres wide; the trees on the near hills in cells TREE_CELL wide. */
const TOWN_CELL = 2.3
const TREE_CELL = 1.6
/** The stars at dusk: across the screen (0 to 1), height over the horizon in backdrop metres, size, twinkle phase. */
const STARS = [
  [0.06, 12.5, 0.34, 0.1],
  [0.14, 9.0, 0.24, 0.6],
  [0.27, 14.2, 0.3, 0.3],
  [0.33, 10.8, 0.2, 0.8],
  [0.41, 13.0, 0.36, 0.45],
  [0.5, 8.6, 0.22, 0.15],
  [0.57, 11.6, 0.28, 0.7],
  [0.63, 14.6, 0.24, 0.35],
  [0.71, 7.4, 0.2, 0.9],
  [0.79, 12.0, 0.34, 0.55],
  [0.86, 9.6, 0.24, 0.05],
  [0.93, 13.6, 0.3, 0.65],
  [0.98, 8.2, 0.2, 0.25],
] as const

/** A colour of the day, sunset and evening skies at `e` from 0 (day) through 0.5 (sunset) to 1 (Good night's dusk). */
function skyMix(day: string, sunset: string, evening: string, e: number) {
  return e < 0.5 ? mixHex(day, sunset, smooth(0, 0.5, e)) : mixHex(sunset, evening, smooth(0.5, 1, e))
}

/** The far hills' height over the horizon at backdrop x, and the near hills'. */
const farHill = (x: number) => 1.9 + 0.75 * Math.sin(x * 0.21) + 0.45 * Math.sin(x * 0.57 + 1.3)
const nearHill = (x: number) => 0.75 + 0.42 * Math.sin(x * 0.33 + 2) + 0.28 * Math.sin(x * 0.81)

/** The sky and the far backdrop behind the street, `evening` from 0 (day) to 1 (Good night's dusk). It sets its own transforms from the view and restores the context. */
export function drawStreetBackdrop(ctx: CanvasRenderingContext2D, view: View, t: number, evening: number): void {
  const e = clamp01(evening)
  const time = heldAge(t)
  const W = view.w
  const H = view.h
  /** CSS px per backdrop metre, the horizon's screen y, and the world x at the screen's middle. */
  const k = Math.sqrt(view.ppm * BACKDROP_PPM)
  const hy = (BACK - view.y0) * view.ppm
  const camX = view.x0 + W / 2 / view.ppm
  const sy = (h: number) => hy - h * k
  const sx = (bx: number, parallax: number) => W / 2 + (bx - camX * parallax) * k
  const bx = (x: number, parallax: number) => camX * parallax + (x - W / 2) / k
  /** The dusk washes the backdrop as the renderer washes the street, a little more the further away. */
  const dusk = (c: string, far: number) => mixHex(c, SKY.evening.bands[0], (0.32 + 0.12 * far) * e)
  ctx.save()
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0)

  // The sky: three bands per time of day, with a band between each two, flat and stepped.
  const [b0, b1, b2] = [0, 1, 2].map((i) => skyMix(SKY.day.bands[i]!, SKY.sunset.bands[i]!, SKY.evening.bands[i]!, e)) as [string, string, string]
  const bands = [b0, mixHex(b0, b1, 0.5), b1, mixHex(b1, b2, 0.5), b2]
  bands.forEach((colour, i) => {
    const top = i === 0 ? 0 : Math.max(0, Math.min(H, sy(BAND_FROM[i]!)))
    const bottom = i === bands.length - 1 ? H : Math.max(0, Math.min(H, sy(BAND_FROM[i + 1]!)))
    if (bottom <= top) return
    ctx.fillStyle = colour
    ctx.fillRect(0, top, W, bottom - top + 1)
  })

  // The stars and the moon come out at dusk; they grow in, and the stars twinkle slowly.
  const starsOut = smooth(0.55, 0.9, e)
  if (starsOut > 0) {
    for (const [fx, h, size, phase] of STARS) {
      const tw = 0.75 + 0.25 * Math.sin(TAU * (time / 2.6 + phase))
      sparklePath(ctx, fx * W, sy(h), size * k * starsOut * tw)
      ctx.fillStyle = C.sparkleWarm
      ctx.fill()
    }
  }
  const moonOut = smooth(0.55, 0.8, e)
  if (moonOut > 0) {
    const mx = W * 0.2
    const my = sy(mix(5, 10.2, smooth(0.55, 1, e)))
    const r = 0.95 * k * moonOut
    circlePath(ctx, mx, my, r * 1.3)
    ctx.fillStyle = mixHex(b1, SKY.evening.sun, 0.1)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(mx, my, r, -Math.PI / 2, Math.PI / 2, true)
    ctx.bezierCurveTo(mx - 0.5 * r, my + 0.55 * r, mx - 0.5 * r, my - 0.55 * r, mx, my - r)
    ctx.closePath()
    ctx.fillStyle = SKY.evening.sun
    ctx.fill()
  }

  // The flat sun with its pale ring (the road's sun too), setting behind the hills.
  const sunH = mix(9.4, -2.2, smooth(0.05, 0.85, e))
  const sr = 1.05 * k
  if (sy(sunH) - sr * 1.5 < H) {
    const set = smooth(0, 0.5, e)
    flatSun(ctx, W * 0.76, sy(sunH), sr, mixHex(SKY.day.sun, SKY.sunset.sun, set), mixHex(SKY.day.halo, SKY.sunset.halo, set))
  }

  // The clouds: flat white heaps with flat bottoms, drifting slowly, a little tinted at dusk.
  const cloud = mixHex(C.cloud, b1, 0.12 + 0.4 * e)
  ctx.fillStyle = cloud
  for (const [at, h, s] of CLOUDS) {
    const drift = (((at + time * CLOUD_DRIFT - camX * PARALLAX.cloud) % CLOUD_LOOP) + CLOUD_LOOP) % CLOUD_LOOP
    const cx = W / 2 + (drift - CLOUD_LOOP / 2) * k
    const cy = sy(h)
    const u = s * k
    if (cx + 2.2 * u < 0 || cx - 2.2 * u > W) continue
    ctx.beginPath()
    for (const [dx, dy, r] of [
      [0, -0.2, 0.95],
      [-1.05, 0.15, 0.62],
      [1.1, 0.2, 0.55],
      [0.5, -0.55, 0.62],
      [-0.5, -0.45, 0.55],
    ] as const) {
      ctx.moveTo(cx + (dx + r) * u, cy + dy * u)
      ctx.arc(cx + dx * u, cy + dy * u, r * u, 0, TAU)
    }
    ctx.rect(cx - 1.05 * u, cy + 0.05 * u, 2.15 * u, 0.7 * u)
    ctx.fill()
  }

  // The far town: a row of houses, a few blocks of flats and a water tower, all one pale tone; their windows light up at dusk.
  const town = mixHex(dusk(ST.town, 1), b2, 0.3)
  const lit = smooth(0.6, 0.9, e)
  const i0 = Math.floor(bx(0, PARALLAX.town) / TOWN_CELL) - 1
  const i1 = Math.ceil(bx(W, PARALLAX.town) / TOWN_CELL) + 1
  for (let i = i0; i <= i1; i++) {
    const kind = rnd(i, 1)
    const w = (0.9 + 0.6 * rnd(i, 2)) * k
    const h = (kind < 0.3 ? 3.6 + 1.2 * rnd(i, 3) : 2.5 + 0.9 * rnd(i, 3)) * k
    const x = sx(i * TOWN_CELL + 0.4 * rnd(i, 4), PARALLAX.town)
    const base = hy + 2
    ctx.beginPath()
    if (kind > 0.9) {
      // A water tower: a round tank on legs.
      ctx.rect(x - 0.08 * k, base - h, 0.16 * k, h)
      ctx.ellipse(x, base - h - 0.35 * k, 0.6 * k, 0.4 * k, 0, 0, TAU)
    } else if (kind < 0.3) {
      // A block of flats with a flat roof.
      ctx.rect(x - w / 2, base - h, w, h)
    } else {
      // A house with a pointed roof and a chimney.
      ctx.moveTo(x - w / 2, base)
      ctx.lineTo(x - w / 2, base - h)
      ctx.lineTo(x, base - h - 0.55 * w)
      ctx.lineTo(x + w / 2, base - h)
      ctx.lineTo(x + w / 2, base)
      ctx.closePath()
      ctx.rect(x + 0.18 * w, base - h - 0.5 * w, 0.14 * w, 0.4 * w)
    }
    ctx.fillStyle = town
    ctx.fill()
    if (lit > 0 && kind <= 0.9) {
      const ws = 0.2 * k * lit
      ctx.beginPath()
      for (let row = 0; row < (kind < 0.3 ? 4 : 2); row++)
        for (const fx of [-0.22, 0.22]) {
          if (rnd(i * 7 + row, fx > 0 ? 5 : 6) < 0.45) continue
          const wx = x + fx * w
          const wy = base - h + (0.55 + row * 0.75) * k
          ctx.rect(wx - ws / 2, wy - ws / 2, ws, ws)
        }
      ctx.fillStyle = ST.townWindow
      ctx.fill()
    }
  }

  // The far hills, then the near hills with their round trees and pines; nothing inked.
  const ridge = (height: (x: number) => number, parallax: number, colour: string) => {
    ctx.beginPath()
    ctx.moveTo(-2, hy + 2)
    for (let px = -2; px <= W + 8; px += 8) ctx.lineTo(px, sy(height(bx(px, parallax))))
    ctx.lineTo(W + 8, hy + 2)
    ctx.closePath()
    ctx.fillStyle = colour
    ctx.fill()
  }
  ridge(farHill, PARALLAX.far, dusk(C.hillFar, 0.8))
  const j0 = Math.floor(bx(0, PARALLAX.near) / TREE_CELL) - 1
  const j1 = Math.ceil(bx(W, PARALLAX.near) / TREE_CELL) + 1
  const trunk = dusk(ST.trunk, 0.5)
  for (let j = j0; j <= j1; j++) {
    if (rnd(j, 7) < 0.35) continue
    const tx = j * TREE_CELL + 0.6 * rnd(j, 8)
    const x = sx(tx, PARALLAX.near)
    const y = sy(nearHill(tx) - 0.2)
    const s = (0.75 + 0.45 * rnd(j, 9)) * k
    ctx.fillStyle = trunk
    ctx.fillRect(x - 0.06 * s, y - 0.5 * s, 0.12 * s, 0.6 * s)
    ctx.beginPath()
    if (rnd(j, 10) < 0.3) {
      ctx.moveTo(x - 0.42 * s, y - 0.35 * s)
      ctx.lineTo(x, y - 1.75 * s)
      ctx.lineTo(x + 0.42 * s, y - 0.35 * s)
      ctx.closePath()
      ctx.fillStyle = dusk(ST.pine, 0.5)
    } else {
      ctx.arc(x, y - 0.95 * s, 0.55 * s, 0, TAU)
      ctx.fillStyle = dusk(ST.tree, 0.5)
    }
    ctx.fill()
  }
  ridge(nearHill, PARALLAX.near, dusk(C.hillNear, 0.5))
  ctx.restore()
}

// ---------------------------------------------------------------------------------------
// The ground

/** Where the street lamps stand between world x0 and x1, whole lamps only. */
function lampsBetween(x0: number, x1: number): number[] {
  const out = MACHINES.filter((_, i) => i % 2 === 0).map((m) => stationLeft(m) + STATION_W - 0.1)
  for (let k = Math.max(0, Math.floor((x0 - PLOTS_X) / PLOT_W) - 1); PLOTS_X + k * PLOT_W < x1; k++) out.push(PLOTS_X + k * PLOT_W + LAMP.plotIn)
  return out.filter((x) => x - LAMP.half >= x0 && x + LAMP.half <= x1)
}

/** A street lamp standing on the pavement at x: a cobalt pole with a crook, a dome shade and a bulb; `lit` 0 to 1 lights it warm with a glow round the bulb and a pool of light under it. */
function drawLamp(ctx: CanvasRenderingContext2D, x: number, lit: number) {
  const top = -LAMP.h
  const hx = x + LAMP.arm
  const hy = top + 0.22
  if (lit > 0) {
    ctx.save()
    ctx.globalAlpha *= lit
    ctx.beginPath()
    ctx.ellipse(hx, LAMP.y - 0.05, LAMP.half * 1.25, 0.16, 0, 0, TAU)
    ctx.fillStyle = C.light
    ctx.fill()
    circlePath(ctx, hx, hy + 0.08, 0.42)
    ctx.fill()
    ctx.restore()
  }
  ctx.save()
  ctx.translate(x, LAMP.y)
  groundShadow(ctx, 0.44)
  ctx.restore()
  ctx.beginPath()
  ctx.moveTo(x, LAMP.y - 0.1)
  ctx.lineTo(x, top + 0.35)
  ctx.quadraticCurveTo(x, top, x + 0.3, top)
  ctx.lineTo(hx, top)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  tube(ctx, 0.08, ST.pole)
  roundRectPath(ctx, x - 0.1, LAMP.y - 0.5, 0.2, 0.46, 0.04)
  part(ctx, ST.pole, 'line')
  circlePath(ctx, hx, hy + 0.06, 0.1)
  part(ctx, mixHex(ST.bulb, ST.bulbLit, lit), 'line')
  ctx.beginPath()
  ctx.moveTo(hx - 0.24, hy)
  ctx.quadraticCurveTo(hx - 0.22, top - 0.04, hx, top - 0.05)
  ctx.quadraticCurveTo(hx + 0.22, top - 0.04, hx + 0.24, hy)
  ctx.closePath()
  part(ctx, ST.pole, 'line')
  circlePath(ctx, hx, top - 0.09, 0.045)
  part(ctx, ST.pole, 'line')
}

/** A tuft of grass, three blades `h` tall at (x, y), in the darker green, no ink. */
function tuft(ctx: CanvasRenderingContext2D, x: number, y: number, h: number) {
  ctx.moveTo(x - h * 0.45, y - h * 0.55)
  ctx.lineTo(x - h * 0.12, y)
  ctx.lineTo(x, y - h)
  ctx.lineTo(x + h * 0.12, y)
  ctx.lineTo(x + h * 0.5, y - h * 0.6)
  ctx.lineTo(x + h * 0.2, y)
  ctx.closePath()
}

/** The ground from x0 to x1 in world metres: pavement, grass, the road in front; lamps light up with the evening. */
export function drawStreetGround(ctx: CanvasRenderingContext2D, x0: number, x1: number, t: number, evening: number): void {
  void t
  const fine = detail(LOT_FRONT - BACK) !== 'S'
  /** The 45-degree marks of a top face from y0 (front) up to y1 (back), every `step` metres, whole ones only. */
  const slants = (y0: number, y1: number, step: number, from: number, to: number) => {
    const d = y0 - y1
    for (let x = Math.ceil(from / step) * step; x + d <= to; x += step) {
      ctx.moveTo(x, y0)
      ctx.lineTo(x + d, y1)
    }
  }
  ctx.save()
  ctx.lineJoin = 'round'
  // The lot: the garage's apron, the yard's sand, the plots' lawn.
  const regions = [
    [x0, Math.min(x1, GARAGE_W), ST.apron],
    [Math.max(x0, GARAGE_W), Math.min(x1, LAWN_X), ST.yard],
    [Math.max(x0, LAWN_X), x1, BOX.grass.face],
  ] as const
  for (const [a, b, colour] of regions) {
    if (b <= a) continue
    ctx.fillStyle = colour
    ctx.fillRect(a, BACK, b - a, LOT_FRONT - BACK)
  }
  ctx.beginPath()
  const apronEnd = Math.min(x1, GARAGE_W)
  if (apronEnd > x0) slants(LOT_FRONT, BACK, 2, x0, apronEnd)
  ctx.lineWidth = lw('detail')
  ctx.strokeStyle = ST.apronJoint
  ctx.stroke()
  // The yard's pebbles and the lawn's tufts, placed by their world position so they never move.
  ctx.beginPath()
  for (let i = Math.ceil(Math.max(x0, GARAGE_W) / 0.7); i * 0.7 + 0.3 < Math.min(x1, LAWN_X); i++) {
    const px = i * 0.7 + 0.25 * rnd(i, 11)
    const py = mix(BACK + 0.15, LOT_FRONT - 0.1, rnd(i, 12))
    ctx.moveTo(px + 0.05, py)
    ctx.ellipse(px, py, 0.05, 0.03, 0, 0, TAU)
  }
  ctx.fillStyle = ST.yardDot
  ctx.fill()
  ctx.beginPath()
  if (fine)
    for (let i = Math.ceil(Math.max(x0, LAWN_X) / 0.9); i * 0.9 + 0.5 < x1; i++) {
      const px = i * 0.9 + 0.3 * rnd(i, 13)
      tuft(ctx, px, mix(0.1, LOT_FRONT - 0.06, rnd(i, 14)), 0.12 + 0.06 * rnd(i, 15))
    }
  ctx.fillStyle = ST.tuft
  ctx.fill()

  // The pavement with its slabs, the kerb's face, the road with its dashes, the verge.
  ctx.fillStyle = ST.pave
  ctx.fillRect(x0, LOT_FRONT, x1 - x0, KERB - LOT_FRONT)
  ctx.fillStyle = ST.kerbFace
  ctx.fillRect(x0, KERB, x1 - x0, ROAD - KERB)
  ctx.fillStyle = BOX.asphalt.face
  ctx.fillRect(x0, ROAD, x1 - x0, VERGE - ROAD)
  ctx.fillStyle = BOX.grass.face
  ctx.fillRect(x0, VERGE, x1 - x0, DEEP - VERGE)
  ctx.beginPath()
  slants(KERB, LOT_FRONT, 1.2, x0, x1)
  ctx.lineWidth = lw('detail')
  ctx.strokeStyle = ST.paveJoint
  ctx.stroke()
  ctx.beginPath()
  for (let x = Math.ceil(x0 / LANE.every) * LANE.every; x + LANE.len <= x1; x += LANE.every) ctx.rect(x, LANE.y - LANE.h / 2, LANE.len, LANE.h)
  ctx.fillStyle = C.laneDash
  ctx.fill()
  ctx.beginPath()
  if (fine)
    for (let i = Math.ceil(x0 / 1.1); i * 1.1 + 0.5 < x1; i++) {
      const px = i * 1.1 + 0.4 * rnd(i, 16)
      tuft(ctx, px, VERGE + 0.25 + 0.3 * rnd(i, 17), 0.14 + 0.06 * rnd(i, 18))
    }
  ctx.fillStyle = ST.tuft
  ctx.fill()

  // Ink along the back edge (the play layer's horizon) and the kerb's top and foot.
  ctx.beginPath()
  ctx.moveTo(x0, BACK)
  ctx.lineTo(x1, BACK)
  ink(ctx, 'line')
  ctx.beginPath()
  ctx.moveTo(x0, KERB)
  ctx.lineTo(x1, KERB)
  ctx.moveTo(x0, ROAD)
  ctx.lineTo(x1, ROAD)
  ink(ctx, 'detail')

  const lit = smooth(0.35, 0.65, evening)
  for (const x of lampsBetween(x0, x1)) drawLamp(ctx, x, lit)
  ctx.restore()
}

// ---------------------------------------------------------------------------------------
// The garage

/** The garage's measures, origin at its bottom-left: the front wall (its right face recedes by DEPTH to GARAGE_W), the big door, the side door, the window over the mirror, the pegboard and the strip light inside (over the truck's bed, clear of its cab), the roof, the sign. */
const GARAGE = {
  w: GARAGE_W - DEPTH,
  h: 4.4,
  door: { x0: 3.35, x1: 9.0, top: -3.5 },
  /** The rolled-up door's housing under the lintel, and the door's bottom rail peeking out under it. */
  roll: 0.42,
  rail: 0.2,
  /** How deep the inside looks: its floor and its left wall recede this far. */
  inside: 0.55,
  side: { x0: 0.95, x1: 2.25, top: -2.45 },
  window: { x: 9.75, y: -3.75, w: 1.4, h: 1.1 },
  peg: { x: 4.05, y: -2.7, w: 2.6, h: 0.95 },
  lamp: { x: 4.95, w: 1.5, h: 0.1 },
  trim: 0.18,
  plinth: 0.26,
  roof: { over: 0.14, h: 0.4 },
  sign: 3.0,
} as const

/** The tools on the pegboard, each hung on a peg at (x, y): a hammer, a wrench, a saw, a coil of rope, a screwdriver. */
function drawTools(ctx: CanvasRenderingContext2D, fine: boolean) {
  const p = GARAGE.peg
  roundRectPath(ctx, p.x, p.y, p.w, p.h, 0.05)
  part(ctx, ST.peg, 'line')
  if (fine) {
    ctx.beginPath()
    for (let ix = 1; ix < 13; ix++)
      for (let iy = 1; iy < 5; iy++) {
        const hx = p.x + (ix * p.w) / 13
        const hy = p.y + (iy * p.h) / 5
        ctx.moveTo(hx + 0.018, hy)
        ctx.arc(hx, hy, 0.018, 0, TAU)
      }
    ctx.fillStyle = ST.pegHole
    ctx.fill()
  }
  const wood = MATERIAL_LOOK.planks
  const steel = BOX.steel
  ctx.lineCap = 'round'
  // The hammer, head up.
  let x = p.x + 0.35
  ctx.beginPath()
  ctx.moveTo(x, p.y + 0.8)
  ctx.lineTo(x, p.y + 0.22)
  tube(ctx, 0.07, wood.face)
  roundRectPath(ctx, x - 0.17, p.y + 0.1, 0.34, 0.13, 0.03)
  part(ctx, steel.face, 'line')
  // The wrench, on a slant.
  x = p.x + 0.82
  ctx.beginPath()
  ctx.moveTo(x - 0.1, p.y + 0.78)
  ctx.lineTo(x + 0.1, p.y + 0.22)
  tube(ctx, 0.07, steel.top)
  ctx.beginPath()
  ctx.arc(x + 0.12, p.y + 0.17, 0.09, Math.PI * 0.95, Math.PI * 2.55)
  ctx.closePath()
  part(ctx, steel.top, 'line')
  // The saw: a toothed blade with a handle.
  x = p.x + 1.15
  ctx.beginPath()
  ctx.moveTo(x + 0.18, p.y + 0.12)
  ctx.lineTo(x + 0.58, p.y + 0.12)
  for (let i = 0; i < 6; i++) {
    ctx.lineTo(x + 0.58 - i * 0.067, p.y + 0.42)
    ctx.lineTo(x + 0.58 - (i + 0.5) * 0.067, p.y + 0.47)
  }
  ctx.lineTo(x + 0.18, p.y + 0.42)
  ctx.closePath()
  part(ctx, steel.top, 'line')
  roundRectPath(ctx, x, p.y + 0.1, 0.22, 0.34, 0.07)
  part(ctx, wood.face, 'line')
  // The coil of rope.
  x = p.x + 2.05
  circlePath(ctx, x, p.y + 0.45, 0.22)
  ctx.lineWidth = 0.09 + 2 * lw('line')
  ctx.strokeStyle = INK
  ctx.stroke()
  ctx.lineWidth = 0.09
  ctx.strokeStyle = C.rope
  ctx.stroke()
  // The screwdriver.
  x = p.x + 2.42
  ctx.beginPath()
  ctx.moveTo(x, p.y + 0.42)
  ctx.lineTo(x, p.y + 0.82)
  tube(ctx, 0.025, steel.face)
  roundRectPath(ctx, x - 0.05, p.y + 0.12, 0.1, 0.32, 0.04)
  part(ctx, ST.door, 'line')
  ctx.lineCap = 'butt'
}

/** The garage, origin at its bottom-left, GARAGE_W wide (layout.ts). */
export function drawGarage(ctx: CanvasRenderingContext2D, t: number, evening: number): void {
  void t
  const G = GARAGE
  const d = G.door
  const fine = detail(G.h) !== 'S'
  const lit = smooth(0.25, 0.6, evening)
  const railY = d.top + G.roll + G.rail
  ctx.save()
  ctx.lineJoin = 'round'

  // The walls: the front with vertical boards, the right face receding, a concrete plinth.
  box(ctx, 0, -G.h, G.w, G.h, WALL, DEPTH, false, true, 'edge')
  if (fine) {
    ctx.beginPath()
    for (let x = 0.42; x < G.w - 0.2; x += 0.34) {
      ctx.moveTo(x, -G.h + 0.05)
      ctx.lineTo(x, -G.plinth)
    }
    ctx.lineWidth = Math.max(lw('detail'), 0.025)
    ctx.strokeStyle = ST.board
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.rect(0, -G.plinth, G.w, G.plinth)
  part(ctx, MATERIAL_LOOK.concrete.face, 'line')
  for (const x of [0, G.w - G.trim]) {
    ctx.beginPath()
    ctx.rect(x, -G.h, G.trim, G.h - G.plinth)
    part(ctx, C.white, 'line')
  }

  // The big door's opening: the inside's floor and left wall receding, the back wall with the pegboard, then the rolled-up door.
  const D2 = G.inside
  ctx.beginPath()
  ctx.rect(d.x0, d.top, d.x1 - d.x0, -d.top)
  ctx.fillStyle = mixHex(ST.inside, ST.insideLit, lit)
  ctx.fill()
  ctx.save()
  ctx.clip()
  ctx.beginPath()
  ctx.moveTo(d.x0, d.top)
  ctx.lineTo(d.x0 + D2, d.top - D2)
  ctx.lineTo(d.x0 + D2, -D2)
  ctx.lineTo(d.x0, 0)
  ctx.closePath()
  ctx.fillStyle = mixHex(ST.insideSide, ST.insideSideLit, lit)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(d.x0, 0)
  ctx.lineTo(d.x0 + D2, -D2)
  ctx.lineTo(d.x1, -D2)
  ctx.lineTo(d.x1, 0)
  ctx.closePath()
  ctx.fillStyle = mixHex(ST.insideFloor, ST.insideFloorLit, lit)
  ctx.fill()
  drawTools(ctx, fine)
  // The strip light on the ceiling: at evening it lights the inside warm.
  const L = G.lamp
  roundRectPath(ctx, L.x - L.w / 2, railY + 0.04, L.w, L.h, L.h / 2)
  part(ctx, mixHex(ST.bulb, ST.bulbLit, lit), 'line')
  ctx.restore()
  ctx.beginPath()
  ctx.rect(d.x0, d.top, d.x1 - d.x0, -d.top)
  ink(ctx, 'line')
  // The roll housing, and the door's bottom rail with hazard stripes and a handle.
  box(ctx, d.x0 - 0.12, d.top - 0.04, d.x1 - d.x0 + 0.24, G.roll, BOX.steel, 0, false, false, 'line')
  if (fine) {
    ctx.beginPath()
    for (let y = d.top + 0.1; y < d.top + G.roll - 0.04; y += 0.1) {
      ctx.moveTo(d.x0 - 0.06, y)
      ctx.lineTo(d.x1 + 0.06, y)
    }
    ctx.lineWidth = lw('detail')
    ctx.strokeStyle = BOX.steel.side
    ctx.stroke()
  }
  ctx.save()
  ctx.beginPath()
  ctx.rect(d.x0, d.top + G.roll - 0.04, d.x1 - d.x0, G.rail + 0.04)
  ctx.fillStyle = BOX.yellow.face
  ctx.fill()
  ctx.clip()
  ctx.beginPath()
  for (let x = d.x0 - 0.3; x < d.x1; x += 0.3) {
    ctx.moveTo(x, railY)
    ctx.lineTo(x + 0.24, d.top + G.roll - 0.04)
    ctx.lineTo(x + 0.39, d.top + G.roll - 0.04)
    ctx.lineTo(x + 0.15, railY)
    ctx.closePath()
  }
  ctx.fillStyle = INK
  ctx.fill()
  ctx.restore()
  ctx.beginPath()
  ctx.rect(d.x0, d.top + G.roll - 0.04, d.x1 - d.x0, G.rail + 0.04)
  ink(ctx, 'line')
  roundRectPath(ctx, (d.x0 + d.x1) / 2 - 0.25, railY - 0.02, 0.5, 0.09, 0.04)
  part(ctx, BOX.steel.side, 'line')

  // The side door with its round window and knob, and the window over the mirror.
  const s = G.side
  roundRectPath(ctx, s.x0 - 0.08, s.top - 0.08, s.x1 - s.x0 + 0.16, -s.top - G.plinth + 0.08, 0.06)
  part(ctx, C.white, 'line')
  ctx.beginPath()
  ctx.rect(s.x0, s.top, s.x1 - s.x0, -s.top - G.plinth)
  part(ctx, ST.door, 'line')
  const wy = s.top + 0.52
  circlePath(ctx, (s.x0 + s.x1) / 2, wy, 0.26)
  part(ctx, mixHex(C.glassTint, ST.bulbLit, lit), 'line')
  if (lit < 0.5) shine(ctx, (s.x0 + s.x1) / 2, wy, 0.26)
  circlePath(ctx, s.x1 - 0.2, s.top + 1.3, 0.07)
  part(ctx, BOX.yellow.face, 'line')
  const w = G.window
  roundRectPath(ctx, w.x - 0.1, w.y - 0.1, w.w + 0.2, w.h + 0.2, 0.06)
  part(ctx, C.white, 'line')
  ctx.beginPath()
  ctx.rect(w.x, w.y, w.w, w.h)
  part(ctx, mixHex(C.glassTint, ST.bulbLit, lit), 'line')
  ctx.beginPath()
  ctx.moveTo(w.x + w.w / 2, w.y)
  ctx.lineTo(w.x + w.w / 2, w.y + w.h)
  ctx.moveTo(w.x, w.y + w.h / 2)
  ctx.lineTo(w.x + w.w, w.y + w.h / 2)
  ctx.lineWidth = 0.08 + 2 * lw('line')
  ctx.strokeStyle = INK
  ctx.stroke()
  ctx.lineWidth = 0.08
  ctx.strokeStyle = C.white
  ctx.stroke()
  if (lit < 0.5) {
    ctx.beginPath()
    ctx.moveTo(w.x + 0.12, w.y + 0.36)
    ctx.lineTo(w.x + 0.36, w.y + 0.12)
    ctx.moveTo(w.x + 0.12, w.y + 0.48)
    ctx.lineTo(w.x + 0.48, w.y + 0.12)
    ctx.lineCap = 'round'
    ctx.lineWidth = Math.max(lw('line'), 0.04)
    ctx.strokeStyle = C.white
    ctx.stroke()
    ctx.lineCap = 'butt'
  }

  // The roof slab and the sign on it: the cat-ear hat, standing on two legs.
  const r = G.roof
  box(ctx, -r.over, -G.h - r.h, G.w + r.over, r.h, BOX.cobalt, DEPTH, true, true, 'edge')
  const top = -G.h - r.h - DEPTH / 2
  const cx = TRUCK_HOME_X
  for (const lx of [cx - 0.75, cx + 0.75]) {
    ctx.beginPath()
    ctx.moveTo(lx, top + 0.06)
    ctx.lineTo(lx, top - 0.4)
    ctx.lineCap = 'round'
    tube(ctx, 0.08, BOX.steel.side)
  }
  ctx.lineCap = 'butt'
  hatEmblem(ctx, cx, top - 0.32, G.sign, 'edge')
  ctx.restore()
}

// ---------------------------------------------------------------------------------------
// The mirror

/** The mirror's measures, origin at its foot: the frame's half-width, top and bottom, how thick the frame is and how deep it stands out; the posts beside it and where it pivots on them. */
const MIRROR = { hw: 0.43, top: -1.95, bottom: -0.3, rim: 0.08, d: 0.07, post: 0.5, foot: 0.1, pivot: -1.08 } as const

/** The standing mirror, origin at its foot. */
export function drawMirror(ctx: CanvasRenderingContext2D, t: number): void {
  const M = MIRROR
  const time = heldAge(t)
  const arc = (inset: number, dx: number, dy: number) => {
    const hw = M.hw - inset
    ctx.beginPath()
    ctx.moveTo(-hw + dx, M.bottom - inset + dy)
    ctx.lineTo(-hw + dx, M.top + M.hw + dy)
    ctx.arc(dx, M.top + M.hw + dy, hw, Math.PI, TAU)
    ctx.lineTo(hw + dx, M.bottom - inset + dy)
    ctx.closePath()
  }
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  groundShadow(ctx, 2 * (M.post + M.foot))
  // The far post, the frame standing out by d, the glass, then the near post and the pivots.
  const post = (x: number) => {
    ctx.beginPath()
    ctx.moveTo(x, -0.02)
    ctx.lineTo(x, M.pivot - 0.12)
    tube(ctx, 0.07, MATERIAL_LOOK.planks.face)
    ctx.beginPath()
    ctx.moveTo(x - M.foot, -0.03)
    ctx.lineTo(x + M.foot, -0.03)
    tube(ctx, 0.06, MATERIAL_LOOK.planks.side)
  }
  post(-M.post)
  arc(0, M.d, -M.d)
  part(ctx, FRAME.side, 'edge')
  arc(0, 0, 0)
  part(ctx, FRAME.face, 'edge')
  arc(M.rim, 0, 0)
  part(ctx, C.glassTint, 'line')
  // A broad lighter band of reflected light, two diagonal shines, and a glint that sweeps across now and then.
  ctx.save()
  arc(M.rim, 0, 0)
  ctx.clip()
  ctx.beginPath()
  ctx.moveTo(-0.5, -0.55)
  ctx.lineTo(0.5, -1.55)
  ctx.lineTo(0.5, -1.05)
  ctx.lineTo(-0.5, -0.05)
  ctx.closePath()
  ctx.fillStyle = mixHex(C.glassTint, C.white, 0.4)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(-0.26, -0.95)
  ctx.lineTo(0.06, -1.6)
  ctx.moveTo(-0.26, -0.7)
  ctx.lineTo(0.2, -1.62)
  ctx.lineWidth = 0.07
  ctx.strokeStyle = C.white
  ctx.stroke()
  const sweep = loop(time, 5, 0.3)
  if (sweep < 0.3) {
    const u = sweep / 0.3
    const gx = mix(-0.35, 0.35, u)
    ctx.beginPath()
    ctx.moveTo(gx - 0.25, M.bottom - M.rim)
    ctx.lineTo(gx + 0.25, M.top + M.rim)
    ctx.lineWidth = 0.02 + 0.06 * arch(u)
    ctx.strokeStyle = C.white
    ctx.stroke()
  }
  ctx.restore()
  arc(M.rim, 0, 0)
  ink(ctx, 'line')
  post(M.post)
  for (const x of [-M.post, M.post]) {
    circlePath(ctx, x, M.pivot, 0.06)
    part(ctx, BOX.yellow.face, 'line')
  }
  ctx.restore()
}

// ---------------------------------------------------------------------------------------
// The plots

/** The empty lot's dirt box: its front from x0 to x1 and DIRT_H tall, its top receding DIRT_D; the fence along its back; the sign in its middle. */
const LOT = { x0: 0.4, x1: PLOT_W - 1.4, front: LOT_FRONT - 0.1, h: 0.08, d: 1.02 } as const
const FENCE = { h: 1.0, every: 1.6, picket: 0.32 } as const
const SIGN = { x: PLOT_W / 2, w: 2.7, h: 1.6, bottom: -0.95, hat: 1.15 } as const
/** After the bulldozer, the fence and the sign pop up over POP_FOR, and the fresh track marks settle into the dirt over FRESH_FOR. */
const POP_FOR = 0.6
const FRESH_FOR = 5
/** The tall house's playground, right of the lift: the swing set and the sandbox. */
const PLAY_X = HOUSE_X + HOUSE_GRID.tall.cols * CELL + LIFT_W + DEPTH + 0.5
const SWING = { x0: PLAY_X + 0.3, x1: PLAY_X + 2.9, h: 2.25, seats: 2 } as const
const SANDBOX_AT = { x: PLAY_X + 3.4, w: 2.3, h: 0.32 } as const

/** The sign of an empty plot: a board on two posts with a house picture, wearing the cat-ear hat. */
function drawLotSign(ctx: CanvasRenderingContext2D, fine: boolean) {
  const s = SIGN
  const x0 = s.x - s.w / 2
  const y0 = s.bottom - s.h
  ctx.lineCap = 'round'
  for (const px of [x0 + 0.45, x0 + s.w - 0.45]) {
    ctx.beginPath()
    ctx.moveTo(px, 0.25)
    ctx.lineTo(px, s.bottom - 0.2)
    tube(ctx, 0.1, MATERIAL_LOOK.planks.face)
  }
  ctx.lineCap = 'butt'
  box(ctx, x0, y0, s.w, s.h, MATERIAL_LOOK.planks, 0.1, true, true, 'edge')
  roundRectPath(ctx, x0 + 0.12, y0 + 0.12, s.w - 0.24, s.h - 0.24, 0.05)
  part(ctx, C.paper, 'line')
  // The house picture: brick walls under a cobalt roof, a door and a window.
  const hx = s.x
  const hb = s.bottom - 0.24
  const hw = 0.95
  const hh = 0.62
  ctx.beginPath()
  ctx.rect(hx - hw / 2, hb - hh, hw, hh)
  part(ctx, MATERIAL_LOOK.bricks.face, 'line')
  ctx.beginPath()
  ctx.moveTo(hx - hw / 2 - 0.14, hb - hh + 0.02)
  ctx.lineTo(hx, hb - hh - 0.48)
  ctx.lineTo(hx + hw / 2 + 0.14, hb - hh + 0.02)
  ctx.closePath()
  part(ctx, BOX.cobalt.face, 'line')
  ctx.beginPath()
  ctx.rect(hx - 0.28, hb - 0.38, 0.2, 0.38)
  part(ctx, MATERIAL_LOOK.planks.face, 'detail')
  ctx.beginPath()
  ctx.rect(hx + 0.08, hb - 0.44, 0.24, 0.22)
  part(ctx, C.glassTint, 'detail')
  if (fine) {
    ctx.beginPath()
    for (const y of [hb - hh + 0.16, hb - hh + 0.32, hb - hh + 0.48]) {
      ctx.moveTo(hx - hw / 2, y)
      ctx.lineTo(hx + hw / 2, y)
    }
    ctx.lineWidth = lw('detail')
    ctx.strokeStyle = MATERIAL_LOOK.bricks.mark
    ctx.stroke()
  }
  // A big plus by the house: something will be built here.
  for (const side of [-1, 1] as const) {
    const px = hx + side * 0.86
    const py = s.bottom - s.h / 2
    ctx.beginPath()
    ctx.moveTo(px - 0.13, py)
    ctx.lineTo(px + 0.13, py)
    ctx.moveTo(px, py - 0.13)
    ctx.lineTo(px, py + 0.13)
    ctx.lineCap = 'round'
    tube(ctx, 0.06, C.ghostLine)
    ctx.lineCap = 'butt'
  }
  hatEmblem(ctx, s.x + 0.05, y0 + 0.08, s.hat, 'line')
}

/** The fence along the lot's back: posts with two rails and pickets between them. */
function drawLotFence(ctx: CanvasRenderingContext2D, fine: boolean) {
  const y = LOT.front - LOT.h - LOT.d
  const xa = LOT.x0 + LOT.d
  const xb = LOT.x1 + LOT.d
  const wood = MATERIAL_LOOK.planks
  ctx.beginPath()
  if (fine) for (let x = xa + 0.16; x < xb - 0.1; x += FENCE.picket) ctx.rect(x - 0.05, y - FENCE.h * 0.82, 0.1, FENCE.h * 0.82)
  ctx.fillStyle = wood.top
  ctx.fill()
  ink(ctx, 'detail')
  ctx.beginPath()
  for (const ry of [y - FENCE.h * 0.68, y - FENCE.h * 0.28]) ctx.rect(xa, ry - 0.06, xb - xa, 0.12)
  part(ctx, wood.face, 'line')
  for (let x = xa; x <= xb + 1e-6; x += (xb - xa) / Math.round((xb - xa) / FENCE.every)) {
    ctx.beginPath()
    ctx.rect(x - 0.07, y - FENCE.h, 0.14, FENCE.h)
    part(ctx, wood.side, 'line')
  }
}

/** The swing set: an A at each end, a bar across and two seats on ropes swinging gently. */
function drawSwings(ctx: CanvasRenderingContext2D, t: number) {
  const S = SWING
  ctx.lineCap = 'round'
  for (const x of [S.x0, S.x1]) {
    ctx.beginPath()
    ctx.moveTo(x - 0.42, 0)
    ctx.lineTo(x, -S.h)
    ctx.lineTo(x + 0.42, 0)
    tube(ctx, 0.1, BOX.cobalt.face)
  }
  ctx.beginPath()
  ctx.moveTo(S.x0 - 0.12, -S.h)
  ctx.lineTo(S.x1 + 0.12, -S.h)
  tube(ctx, 0.12, BOX.cobalt.face)
  for (let i = 0; i < S.seats; i++) {
    const px = mix(S.x0, S.x1, (i + 1) / (S.seats + 1))
    const swing = 0.22 * Math.sin(TAU * (t / 2.8 + phaseOf(`swing${i}`)))
    const len = S.h - 0.48
    ctx.save()
    ctx.translate(px, -S.h)
    ctx.rotate(swing)
    ctx.beginPath()
    ctx.moveTo(-0.2, 0)
    ctx.lineTo(-0.2, len)
    ctx.moveTo(0.2, 0)
    ctx.lineTo(0.2, len)
    ctx.lineWidth = lw('line')
    ctx.strokeStyle = INK
    ctx.stroke()
    roundRectPath(ctx, -0.3, len - 0.03, 0.6, 0.12, 0.05)
    part(ctx, i === 0 ? ST.flag : BOX.yellow.face, 'line')
    ctx.restore()
  }
  ctx.lineCap = 'butt'
}

/** The sandbox with a sand castle, a bucket and a spade in it. */
function drawSandbox(ctx: CanvasRenderingContext2D) {
  const S = SANDBOX_AT
  const d = DEPTH
  box(ctx, S.x, -S.h, S.w, S.h, SANDBOX, d, true, true, 'line')
  // The castle: two towers and a wall with notches, in damp sand.
  const cx = S.x + 0.75
  const base = -S.h - d * 0.45
  ctx.beginPath()
  ctx.moveTo(cx - 0.32, base)
  ctx.lineTo(cx - 0.32, base - 0.36)
  for (let i = 0; i < 3; i++) {
    ctx.lineTo(cx - 0.32 + i * 0.12, base - 0.44)
    ctx.lineTo(cx - 0.26 + i * 0.12, base - 0.44)
    ctx.lineTo(cx - 0.26 + i * 0.12, base - 0.36)
    ctx.lineTo(cx - 0.2 + i * 0.12, base - 0.36)
  }
  ctx.lineTo(cx + 0.04, base - 0.24)
  ctx.lineTo(cx + 0.32, base - 0.24)
  ctx.lineTo(cx + 0.32, base)
  ctx.closePath()
  part(ctx, ST.sandDark, 'line')
  ctx.beginPath()
  ctx.moveTo(cx - 0.14, base - 0.44)
  ctx.lineTo(cx - 0.14, base - 0.62)
  ink(ctx, 'detail')
  ctx.beginPath()
  ctx.moveTo(cx - 0.14, base - 0.62)
  ctx.lineTo(cx + 0.02, base - 0.56)
  ctx.lineTo(cx - 0.14, base - 0.5)
  ctx.closePath()
  part(ctx, ST.flag, 'detail')
  // The bucket and the spade.
  const bx = S.x + 1.6
  ctx.beginPath()
  ctx.moveTo(bx - 0.16, base - 0.3)
  ctx.lineTo(bx + 0.16, base - 0.3)
  ctx.lineTo(bx + 0.12, base)
  ctx.lineTo(bx - 0.12, base)
  ctx.closePath()
  part(ctx, BOX.cobalt.face, 'line')
  ctx.beginPath()
  ctx.arc(bx, base - 0.3, 0.14, Math.PI, TAU)
  ink(ctx, 'detail')
  ctx.beginPath()
  ctx.moveTo(bx + 0.34, base - 0.05)
  ctx.lineTo(bx + 0.5, base - 0.48)
  ctx.lineCap = 'round'
  tube(ctx, 0.03, BOX.yellow.face)
  ctx.lineCap = 'butt'
  ctx.beginPath()
  ctx.ellipse(bx + 0.31, base + 0.01, 0.08, 0.05, -1.2, 0, TAU)
  part(ctx, BOX.yellow.face, 'line')
}

/** Each row-house home's mailbox, in plot metres (origin at the plot's bottom-left): at the foot of its door, its round top just over the ground line, its post down into the front strip. */
export const MAILBOXES = Array.from({ length: HOUSE_GRID.row.cols / HOME_COLS }, (_, i) => rect(HOUSE_X + i * HOME_COLS * CELL + 0.25, -0.08, 0.6, GARDEN_Y + 0.08))

/** A front garden's mailbox on a short post at x, under its home's door: a box in the door's `colour` with a slot, a round top and a white flag. */
function drawMailbox(ctx: CanvasRenderingContext2D, x: number, colour: string) {
  ctx.beginPath()
  ctx.moveTo(x, GARDEN_Y)
  ctx.lineTo(x, 0.3)
  ctx.lineCap = 'round'
  tube(ctx, 0.06, MATERIAL_LOOK.planks.side)
  ctx.lineCap = 'butt'
  ctx.beginPath()
  ctx.moveTo(x - 0.2, 0.32)
  ctx.lineTo(x - 0.2, 0.12)
  ctx.arc(x, 0.12, 0.2, Math.PI, TAU)
  ctx.lineTo(x + 0.2, 0.32)
  ctx.closePath()
  part(ctx, colour, 'line')
  ctx.beginPath()
  ctx.moveTo(x - 0.1, 0.14)
  ctx.lineTo(x + 0.1, 0.14)
  ctx.lineCap = 'round'
  ink(ctx, 'line')
  ctx.beginPath()
  ctx.moveTo(x + 0.2, 0.22)
  ctx.lineTo(x + 0.3, 0.22)
  ctx.lineTo(x + 0.3, -0.04)
  ink(ctx, 'detail')
  ctx.lineCap = 'butt'
  ctx.beginPath()
  ctx.rect(x + 0.3, -0.04, 0.14, 0.1)
  part(ctx, ST.mailFlag, 'detail')
}

/** A round bush between two front gardens at x, standing in the front strip. */
function drawBush(ctx: CanvasRenderingContext2D, x: number) {
  const y = GARDEN_Y
  blob(ctx, [x, y - 0.24, 0.24, x - 0.21, y - 0.13, 0.17, x + 0.22, y - 0.14, 0.18, x + 0.07, y - 0.4, 0.16], BUSH, 'line')
  ctx.beginPath()
  ctx.moveTo(x - 0.12, y - 0.3)
  ctx.quadraticCurveTo(x - 0.04, y - 0.38, x + 0.05, y - 0.33)
  ctx.moveTo(x + 0.1, y - 0.18)
  ctx.quadraticCurveTo(x + 0.18, y - 0.25, x + 0.26, y - 0.2)
  ctx.lineCap = 'round'
  ctx.lineWidth = lw('detail')
  ctx.strokeStyle = BOX.grass.top
  ctx.stroke()
  ctx.lineCap = 'butt'
}

/** A row of flowers from x0 to x1 along the front strip, swaying a little. */
function drawFlowers(ctx: CanvasRenderingContext2D, x0: number, x1: number, t: number, seed: number) {
  const n = Math.max(1, Math.floor((x1 - x0) / 0.62))
  for (let i = 0; i < n; i++) {
    const x = x0 + ((i + 0.5) * (x1 - x0)) / n
    const sway = 0.02 * Math.sin(TAU * (t / 2.4 + phaseOf(seed * 31 + i)))
    flower(ctx, x, GARDEN_Y - 0.02 * (i % 2), 0.36 + 0.08 * ((i + seed) % 3), 0.2, i + seed, sway)
  }
}

/** A plot's ground, origin at its bottom-left, PLOT_W wide: with no house yet, a fence, dirt and a sign; with a tall house, the playground beside it; with a row house, three front gardens. `age` seconds since the bulldozer levelled it; `mailboxes` how much of each home's mailbox shows, 0 to 1 (all of each when left out), as house.ts drawDoors takes its door's. */
export function drawPlotGround(ctx: CanvasRenderingContext2D, kind: HouseKind | null, age: number, t: number, mailboxes: readonly number[] = []): void {
  const time = heldAge(t)
  const a = heldAge(age)
  const fine = detail(2) !== 'S'
  ctx.save()
  ctx.lineJoin = 'round'
  if (kind === null) {
    // The dirt, behind the bulldozer while it works; its fresh tracks settle into it.
    const u = clamp01(a / BULLDOZE)
    const end = a < BULLDOZE ? Math.min(LOT.x1, u * PLOT_W - 0.9) : LOT.x1
    if (end > LOT.x0 + 0.2) {
      box(ctx, LOT.x0, LOT.front - LOT.h, end - LOT.x0, LOT.h, DIRT, LOT.d, true, true, 'line')
      const fresh = 1 - smooth(0, FRESH_FOR, a - BULLDOZE)
      ctx.beginPath()
      for (let i = 0; LOT.x0 + 0.5 + i * 0.75 < end - 0.2; i++) {
        const x = LOT.x0 + 0.5 + i * 0.75 + 0.2 * rnd(i, 21)
        const y = mix(LOT.front - 0.25, LOT.front - LOT.d + 0.1, rnd(i, 22))
        ctx.moveTo(x + 0.07, y)
        ctx.ellipse(x, y, 0.07, 0.04, 0, 0, TAU)
      }
      ctx.fillStyle = DIRT.side
      ctx.fill()
      if (fresh > 0) {
        // The tracks: two rows of cleat marks along the lot.
        ctx.beginPath()
        for (const ty of [LOT.front - 0.3, LOT.front - 0.62])
          for (let x = LOT.x0 + 0.4; x < end - 0.1; x += 0.28) {
            ctx.moveTo(x, ty)
            ctx.lineTo(x + 0.12, ty - 0.12)
          }
        ctx.lineCap = 'round'
        ctx.lineWidth = Math.max(lw('line'), 0.05) * fresh
        ctx.strokeStyle = mixHex(DIRT.top, DIRT.side, fresh)
        ctx.stroke()
        ctx.lineCap = 'butt'
      }
    }
    // The fence and the sign pop up once the bulldozer is done.
    const pop = a - BULLDOZE
    if (pop > 0) {
      const grow = smooth(0, POP_FOR * 0.5, pop)
      const [sx, sy] = squash(pop - POP_FOR * 0.5)
      ctx.save()
      ctx.translate(PLOT_W / 2, LOT.front - LOT.h - LOT.d)
      ctx.scale(sx, sy * grow)
      ctx.translate(-PLOT_W / 2, -(LOT.front - LOT.h - LOT.d))
      drawLotFence(ctx, fine)
      ctx.restore()
      ctx.save()
      ctx.translate(SIGN.x, 0)
      ctx.scale(sx * grow, sy * grow)
      ctx.translate(-SIGN.x, 0)
      ctx.save()
      ctx.translate(SIGN.x, 0.15)
      groundShadow(ctx, SIGN.w)
      ctx.restore()
      drawLotSign(ctx, fine)
      ctx.restore()
    }
  } else if (kind === 'tall') {
    drawFlowers(ctx, HOUSE_X + 0.3, PLAY_X - 0.6, time, 0)
    ctx.save()
    ctx.translate(SWING.x0 + (SWING.x1 - SWING.x0) / 2, 0)
    groundShadow(ctx, SWING.x1 - SWING.x0 + 1.2)
    ctx.restore()
    drawSwings(ctx, time)
    ctx.save()
    ctx.translate(SANDBOX_AT.x + SANDBOX_AT.w / 2, 0)
    groundShadow(ctx, SANDBOX_AT.w + 0.4)
    ctx.restore()
    drawSandbox(ctx)
  } else {
    const homes = HOUSE_GRID.row.cols / HOME_COLS
    const homeW = HOME_COLS * CELL
    for (let i = 0; i < homes; i++) {
      const x0 = HOUSE_X + i * homeW
      if (i > 0) drawBush(ctx, x0 - 0.8)
      const shown = mailboxes[i] ?? 1
      if (shown > 0) {
        ctx.save()
        ctx.globalAlpha *= shown
        drawMailbox(ctx, MAILBOXES[i]!.x + 0.2, HOME_DOORS[i]!.face)
        ctx.restore()
      }
      drawFlowers(ctx, x0 + 0.95, x0 + homeW - 0.4, time, i + 1)
    }
  }
  ctx.restore()
}

// ---------------------------------------------------------------------------------------
// The crane

/** The crane's measures: the mast's width and the height of a lattice bay, the jib's depth and bay, the counter-jib's length and the tower head's height over the jib. */
const CRANE = { mast: 0.7, bay: 0.7, jib: 0.55, jibBay: 0.8, counter: 2.6, head: 1.7, foot: 0.3 } as const
/** The hook: the block on the cable and the hook under it, together HOOK tall over the hook's point. */
const HOOK = { block: 0.36, w: 0.5, hook: 0.3 } as const

/** A lattice between two chords: (ax, ay)-(bx, by) and (cx, cy)-(dx, dy) in `n` bays, zig-zag braces. */
function lattice(ctx: CanvasRenderingContext2D, a: readonly [number, number], b: readonly [number, number], c: readonly [number, number], d: readonly [number, number], n: number, w: number) {
  ctx.beginPath()
  for (let i = 0; i < n; i++) {
    const u0 = i / n
    const u1 = (i + 1) / n
    const p = i % 2 === 0 ? [mix(a[0], b[0], u0), mix(a[1], b[1], u0), mix(c[0], d[0], u1), mix(c[1], d[1], u1)] : [mix(c[0], d[0], u0), mix(c[1], d[1], u0), mix(a[0], b[0], u1), mix(a[1], b[1], u1)]
    ctx.moveTo(p[0]!, p[1]!)
    ctx.lineTo(p[2]!, p[3]!)
  }
  tube(ctx, w * 0.6, BOX.yellow.face)
  ctx.beginPath()
  ctx.moveTo(a[0], a[1])
  ctx.lineTo(b[0], b[1])
  ctx.moveTo(c[0], c[1])
  ctx.lineTo(d[0], d[1])
  tube(ctx, w, BOX.yellow.face)
}

/** The tower crane standing at a plot, its mast `height` metres tall with the hook hanging `drop` metres below the jib at `reach` metres from the mast; origin at the mast's foot. */
export function drawCrane(ctx: CanvasRenderingContext2D, height: number, reach: number, drop: number, t: number): void {
  void t
  const K = CRANE
  const hw = K.mast / 2
  const jy = -height
  const fine = detail(height) !== 'S'
  const chord = Math.max(0.07, lw('line') * 1.5)
  /** The jib reaches a whole number of bays past the trolley. */
  const len = Math.max(3.2, Math.ceil((reach + 1.0) / K.jibBay) * K.jibBay)
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  // The footing.
  groundShadow(ctx, 1.8)
  box(ctx, -0.75, -K.foot, 1.5, K.foot, MATERIAL_LOOK.concrete, 0.12, true, true, 'line')
  // The mast.
  const bays = Math.max(1, Math.round((height - K.foot) / K.bay))
  lattice(ctx, [-hw, -K.foot], [-hw, jy], [hw, -K.foot], [hw, jy], bays, chord)
  // The tower head and its ties to the jib's tip and the counter-jib's end.
  const apex = jy - K.head
  const tie = len * 0.7
  ctx.beginPath()
  ctx.moveTo(-K.counter + 0.2, jy - K.jib * 0.5)
  ctx.lineTo(0, apex)
  ctx.lineTo(tie, jy - K.jib * mix(1, 0.35, (tie - hw) / (len - hw)))
  ctx.lineWidth = lw('line')
  ctx.strokeStyle = INK
  ctx.stroke()
  lattice(ctx, [-hw, jy], [0, apex], [hw, jy], [0, apex], 3, chord)
  // The counter-jib with its concrete weights, and the jib.
  lattice(ctx, [-K.counter, jy], [-hw, jy], [-K.counter, jy - K.jib * 0.5], [-hw, jy - K.jib * 0.5], 3, chord)
  box(ctx, -K.counter + 0.05, jy - 0.05, 1.0, 0.85, MATERIAL_LOOK.concrete, 0.12, true, true, 'line')
  if (fine) {
    ctx.beginPath()
    ctx.moveTo(-K.counter + 0.05, jy + 0.35)
    ctx.lineTo(-K.counter + 1.05, jy + 0.35)
    ink(ctx, 'detail')
  }
  lattice(ctx, [hw, jy], [len, jy], [hw, jy - K.jib], [len, jy - K.jib * 0.35], Math.max(2, Math.round(len / K.jibBay)), chord)
  // The cab under the jib, beside the mast: a yellow box with a big window.
  box(ctx, hw - 0.05, jy + 0.05, 0.85, 0.85, BOX.yellow, 0.12, false, true, 'edge')
  roundRectPath(ctx, hw + 0.12, jy + 0.16, 0.6, 0.44, 0.06)
  part(ctx, C.glassTint, 'line')
  shine(ctx, hw + 0.42, jy + 0.38, 0.2)
  // The trolley, the cable and the hook.
  const hx = reach
  const hy = jy + Math.max(drop, 0)
  ctx.beginPath()
  ctx.rect(hx - 0.25, jy, 0.5, 0.16)
  part(ctx, BOX.asphalt.face, 'line')
  const blockTop = hy - HOOK.hook - HOOK.block
  if (blockTop > jy + 0.16) {
    ctx.beginPath()
    ctx.moveTo(hx, jy + 0.16)
    ctx.lineTo(hx, blockTop)
    ink(ctx, 'line')
  }
  ctx.save()
  roundRectPath(ctx, hx - HOOK.w / 2, blockTop, HOOK.w, HOOK.block, 0.05)
  ctx.fillStyle = BOX.yellow.face
  ctx.fill()
  ctx.clip()
  ctx.beginPath()
  for (let x = hx - HOOK.w; x < hx + HOOK.w; x += 0.2) {
    ctx.moveTo(x, blockTop + HOOK.block)
    ctx.lineTo(x + HOOK.block, blockTop)
    ctx.lineTo(x + HOOK.block + 0.09, blockTop)
    ctx.lineTo(x + 0.09, blockTop + HOOK.block)
    ctx.closePath()
  }
  ctx.fillStyle = INK
  ctx.fill()
  ctx.restore()
  roundRectPath(ctx, hx - HOOK.w / 2, blockTop, HOOK.w, HOOK.block, 0.05)
  ink(ctx, 'line')
  ctx.beginPath()
  ctx.moveTo(hx, hy - HOOK.hook)
  ctx.lineTo(hx, hy - HOOK.hook * 0.45)
  ctx.arc(hx - 0.1, hy - HOOK.hook * 0.45, 0.1, 0, Math.PI * 0.95)
  tube(ctx, 0.055, BOX.steel.top)
  ctx.restore()
}

// ---------------------------------------------------------------------------------------
// The bulldozer

/** The bulldozer's measures, origin at its feet facing right: the tracks, the body, the cab, the blade and its arm. */
const DOZER = { trackX0: -1.0, trackX1: 0.62, trackH: 0.46, wheel: 0.17, bodyY: -0.98, cab: { x0: -0.9, x1: 0.02, top: -1.82 }, blade: { x: 0.92, w: 0.16, h: 0.86 } } as const

/** The little bulldozer that levels a new plot, `u` from 0 to 1 across it; origin at its feet. */
export function drawBulldozer(ctx: CanvasRenderingContext2D, u: number, t: number): void {
  const time = heldAge(t)
  const k = clamp01(u)
  const Z = DOZER
  const roll = k * PLOT_W
  const bob = 0.015 * Math.sin(TAU * 5 * time)
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  groundShadow(ctx, 2.6)
  // The dirt it pushes, growing as it goes, a few clods tumbling off its front.
  const pile = 0.18 + 0.42 * smooth(0, 0.6, k)
  const px = Z.blade.x + Z.blade.w
  ctx.beginPath()
  ctx.moveTo(px - 0.05, 0)
  ctx.lineTo(px - 0.05, -pile)
  ctx.quadraticCurveTo(px + 0.3, -pile * 1.05, px + 0.4 + pile * 0.5, -pile * 0.35)
  ctx.quadraticCurveTo(px + 0.55 + pile * 0.6, 0, px + 0.6 + pile * 0.6, 0)
  ctx.closePath()
  part(ctx, BOX.soil.face, 'line')
  ctx.beginPath()
  ctx.moveTo(px, -pile * 0.55)
  ctx.quadraticCurveTo(px + 0.25, -pile * 0.75, px + 0.35, -pile * 0.45)
  ctx.lineWidth = lw('detail')
  ctx.strokeStyle = BOX.soil.top
  ctx.stroke()
  for (let i = 0; i < 2; i++) {
    const c = loop(time, 0.7, i * 0.5)
    const cx = px + 0.45 + pile * 0.5 + 0.35 * c
    const cy = -pile * 0.5 * (1 - c) - 0.06 + 0.5 * c * c * pile
    ctx.save()
    ctx.translate(cx, Math.min(-0.06, cy))
    ctx.rotate(c * 4)
    roundRectPath(ctx, -0.06, -0.06, 0.12, 0.12, 0.03)
    part(ctx, BOX.soil.side, 'detail')
    ctx.restore()
  }
  // The blade on its arm.
  ctx.beginPath()
  ctx.moveTo(Z.trackX1 - 0.15, -0.5)
  ctx.lineTo(Z.blade.x + 0.02, -0.42)
  tube(ctx, 0.1, BOX.yellow.side)
  ctx.beginPath()
  ctx.moveTo(Z.blade.x, -Z.blade.h)
  ctx.quadraticCurveTo(Z.blade.x - 0.1, -Z.blade.h * 0.45, Z.blade.x, 0)
  ctx.lineTo(Z.blade.x + Z.blade.w, 0)
  ctx.quadraticCurveTo(Z.blade.x + Z.blade.w - 0.1, -Z.blade.h * 0.45, Z.blade.x + Z.blade.w, -Z.blade.h)
  ctx.closePath()
  part(ctx, BOX.steel.face, 'edge')
  ctx.translate(0, bob)
  // The exhaust pipe and its puffs.
  const ex = 0.32
  const etop = Z.bodyY - 0.5
  for (let i = 0; i < 3; i++) {
    const p = loop(time, 1.1, i / 3)
    const r = 0.07 * (0.6 + 1.4 * p) * (1 - smooth(0.7, 1, p))
    puff(ctx, ex - 0.35 * p, etop - 0.12 - 0.55 * p, r, ST.puff)
  }
  ctx.beginPath()
  ctx.moveTo(ex, Z.bodyY + 0.05)
  ctx.lineTo(ex, etop)
  tube(ctx, 0.07, BOX.steel.side)
  // The cab: a rounded yellow box with one big window, an orange beacon on its roof.
  const c = Z.cab
  roundRectPath(ctx, c.x0, c.top, c.x1 - c.x0, Z.bodyY - c.top + 0.05, 0.12)
  part(ctx, BOX.yellow.face, 'edge')
  roundRectPath(ctx, c.x0 + 0.14, c.top + 0.14, c.x1 - c.x0 - 0.26, 0.5, 0.08)
  part(ctx, C.glassTint, 'line')
  ctx.beginPath()
  ctx.moveTo(c.x0 + 0.24, c.top + 0.5)
  ctx.lineTo(c.x0 + 0.44, c.top + 0.24)
  ctx.lineWidth = Math.max(lw('line'), 0.04)
  ctx.strokeStyle = C.white
  ctx.stroke()
  ctx.beginPath()
  ctx.rect(c.x0 + 0.3, c.top - 0.06, 0.3, 0.07)
  part(ctx, BOX.steel.side, 'line')
  ctx.beginPath()
  ctx.arc(c.x0 + 0.45, c.top - 0.06, 0.14, Math.PI, TAU)
  ctx.closePath()
  part(ctx, BOX.orange.face, 'line')
  shine(ctx, c.x0 + 0.45, c.top - 0.06, 0.14)
  // The body: the engine's hood in front of the cab, the right face receding.
  box(ctx, -0.98, Z.bodyY, Z.trackX1 + 0.12 + 0.98, -Z.bodyY - Z.trackH + 0.06, BOX.yellow, 0.12, true, true, 'edge')
  ctx.beginPath()
  for (const y of [Z.bodyY + 0.14, Z.bodyY + 0.24]) {
    ctx.moveTo(0.18, y)
    ctx.lineTo(Z.trackX1 - 0.02, y)
  }
  ink(ctx, 'detail')
  ctx.translate(0, -bob)
  // The tracks: a long loop round turning wheels.
  roundRectPath(ctx, Z.trackX0, -Z.trackH, Z.trackX1 - Z.trackX0, Z.trackH, Z.trackH / 2)
  part(ctx, C.tyre, 'edge')
  if (detail(1.8) !== 'S') {
    ctx.save()
    roundRectPath(ctx, Z.trackX0, -Z.trackH, Z.trackX1 - Z.trackX0, Z.trackH, Z.trackH / 2)
    ctx.clip()
    ctx.beginPath()
    const shift = (roll * 1.0) % 0.16
    for (let x = Z.trackX0 - 0.16 + shift; x < Z.trackX1; x += 0.16) {
      ctx.moveTo(x, -0.06)
      ctx.lineTo(x + 0.06, 0.02)
    }
    ctx.lineWidth = lw('line')
    ctx.strokeStyle = BOX.steel.side
    ctx.stroke()
    ctx.restore()
  }
  const wheels = [Z.trackX0 + 0.23, -0.4, 0.05, Z.trackX1 - 0.23]
  wheels.forEach((wx, i) => {
    const r = i === 0 || i === wheels.length - 1 ? Z.wheel : Z.wheel * 0.75
    const wy = -Z.trackH / 2
    circlePath(ctx, wx, wy, r)
    part(ctx, C.hub, 'line')
    const turn = roll / r
    ctx.beginPath()
    for (let s = 0; s < 3; s++) {
      const a = turn + (s / 3) * TAU
      ctx.moveTo(wx, wy)
      ctx.lineTo(wx + Math.cos(a) * r * 0.7, wy + Math.sin(a) * r * 0.7)
    }
    ink(ctx, 'detail')
  })
  ctx.restore()
}

// ---------------------------------------------------------------------------------------
// The sheet

/** The view a sheet cell's canvas shows: read back from the context's transform, so the backdrop (which sets its own transform) draws into the cell. */
function sheetView(ctx: CanvasRenderingContext2D): View {
  const m = ctx.getTransform()
  return { w: ctx.canvas.width / pen.dpr, h: ctx.canvas.height / pen.dpr, dpr: pen.dpr, ppm: m.a / pen.dpr, x0: -m.e / m.a, y0: -m.f / m.d }
}

/** A slice of the street as the street shot shows it (sky, ground, garage, mirror, a yard lamp) at a time of day; entries draw at the street's own scale with &px=42. */
function scene(evening: number): SheetEntry['draw'] {
  return (ctx, t) => {
    drawStreetBackdrop(ctx, sheetView(ctx), t, evening)
    drawStreetGround(ctx, -0.5, 23, t, evening)
    drawGarage(ctx, t, evening)
    ctx.save()
    ctx.translate(MIRROR_X, 0)
    drawMirror(ctx, t)
    ctx.restore()
  }
}

/** The bulldozer's shadow reaches this far back of its feet: as a new plot's replay starts it stands at the plot's left edge. */
const DOZER_BACK = 1.3

/** One plot over its stretch of ground, as on the street; a new plot's ground runs back under the bulldozer. */
function plot(kind: HouseKind | null, age: (t: number) => number, dozer: boolean): SheetEntry['draw'] {
  return (ctx, t) => {
    ctx.save()
    ctx.translate(-PLOTS_X, 0)
    drawStreetGround(ctx, PLOTS_X - (dozer ? DOZER_BACK : 0.2), PLOTS_X + PLOT_W + 0.2, t, 0)
    ctx.restore()
    const a = age(t)
    drawPlotGround(ctx, kind, a, t)
    if (dozer && a < BULLDOZE) {
      ctx.save()
      ctx.translate((a / BULLDOZE) * PLOT_W, 0)
      drawBulldozer(ctx, a / BULLDOZE, t)
      ctx.restore()
    }
  }
}

/** A plot with its street lamp, whose head and knob reach over LAMP.h; a new plot's reaches back over the bulldozer. */
const plotBox = rect(-0.3, -4.0, PLOT_W + 0.6, 6.6)
const newPlotBox = rect(-DOZER_BACK, -4.0, PLOT_W + 2.3 + DOZER_BACK, 6.6)
const garageBox = rect(-0.3, -7.6, GARAGE_W + 0.6, 10.3)

export const STREET_SHEET: SheetEntry[] = [
  { label: 'street by day (px=42 shows it at street size)', box: rect(-0.5, -14.5, 23.5, 17), draw: scene(0) },
  { label: 'street at sunset', box: rect(-0.5, -14.5, 23.5, 17), draw: scene(0.5) },
  { label: 'street at Good night', box: rect(-0.5, -14.5, 23.5, 17), draw: scene(1) },
  { label: 'garage by day', box: garageBox, draw: (ctx, t) => drawGarage(ctx, t, 0) },
  { label: 'garage at evening', box: garageBox, draw: (ctx, t) => drawGarage(ctx, t, 1) },
  { label: 'mirror', box: rect(-0.7, -2.1, 1.4, 2.2), draw: drawMirror },
  { label: 'ground with lamps, evening comes and goes', box: rect(14, -4, 10, 7), draw: (ctx, t) => drawStreetGround(ctx, 14, 24, t, arch(loop(t, 8, 0))) },
  { label: 'empty plot', box: plotBox, draw: plot(null, () => 1e4, false) },
  { label: 'new plot: the bulldozer, then the fence and sign pop up (replays)', box: newPlotBox, draw: plot(null, (t) => t % 7, true) },
  { label: 'tall house plot', box: plotBox, draw: plot('tall', () => 1e4, false) },
  { label: 'row house plot', box: plotBox, draw: plot('row', () => 1e4, false) },
  { label: 'bulldozer', box: rect(-1.4, -2.4, 3.6, 2.5), draw: (ctx, t) => drawBulldozer(ctx, (t % 2.4) / 2.4, t) },
  { label: 'crane for a tall house, lowering', box: rect(-3, -17, 14, 17.2), draw: (ctx, t) => drawCrane(ctx, 14.8, 4.6, 0.6 + 4 * arch(loop(t, 6, 0)), t) },
  { label: 'crane dropping a crate', box: rect(-3, -9.2, 7.8, 9.4), draw: (ctx, t) => drawCrane(ctx, 7, 3.5, 1.2 + 4.2 * smooth(0, 1, loop(t, 3, 0)), t) },
]
