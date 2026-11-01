import { FEED_GROUND, FEED_H, FEED_W, TRACK_L, TRACK_R, type CourseId } from '../game/model'
import { INK, LINE, LINE_DETAIL, circlesPath, hash, inkOval, inked, lw, roundRectPath, shine, type SheetEntry } from './look'
import { LAND } from './world'

/**
 * The finale's backdrop, seen from the side: the scene is FEED_W x FEED_H tiles, y down,
 * origin at its top-left, the ground's top at FEED_GROUND, the monster's rails from TRACK_L
 * to TRACK_R. Behind the track a sunny sky in flat bands, a soft sun, slow clouds, and two
 * rows of distant hills with the course's trees (and the farm's barn, the castle's castle),
 * all low in contrast and without ink so the play layer stands out. Then the track: the
 * course's grass and the soil under it, and the rails on their sleepers with a buffer stop
 * at each end, inked like everything that plays. Every x is the scene's own, so any range
 * a wide screen shows draws the same world.
 */

/** Each course's sky, its bands from the top down to the horizon. */
const SKY: Record<CourseId, readonly string[]> = {
  park: ['#74C4F0', '#8DCFF3', '#A6DAF6', '#BFE4F8', '#D8EFFA'],
  pond: ['#68BFE4', '#82CBE9', '#9BD6ED', '#B4E0F1', '#CDEBF4'],
  garden: ['#86C6EF', '#A0D1F2', '#BADBF4', '#D3E3F4', '#EEE2EE'],
  farm: ['#80C2EA', '#99CCEC', '#B2D6EE', '#CADFEC', '#F0E4C6'],
  castle: ['#6AA6DE', '#82B5E4', '#9BC4EA', '#B4D3EF', '#CCE1F3'],
}
/** Where each sky band ends (the last runs down to the hills). */
const BANDS = [1.6, 3.2, 4.6, 5.8] as const
const SUN = { disc: '#FFF4B8', halo: 'rgba(255, 244, 184, 0.4)' }
const CLOUD = 'rgba(255, 255, 255, 0.92)'
/** Each course's distant land: far hills, near hills, the trees on them, and its landmark's two tones. */
const DISTANT: Record<CourseId, { far: string; near: string; tree: string; trunk: string; mark: string; markShade: string }> = {
  park: { far: '#A9D9B0', near: '#93CE8C', tree: '#7DBD77', trunk: '#A58B6E', mark: '#E8A0A0', markShade: '#C98585' },
  pond: { far: '#A2D6C4', near: '#86C9A6', tree: '#8CC788', trunk: '#9C8B6E', mark: '#B9DCE6', markShade: '#98C2CF' },
  garden: { far: '#B3DDB3', near: '#9AD38E', tree: '#86C47E', trunk: '#A58B6E', mark: '#F0B3CF', markShade: '#D894B3' },
  farm: { far: '#C9DC9C', near: '#B4D07C', tree: '#94BA67', trunk: '#A0876A', mark: '#E39A87', markShade: '#C27C6A' },
  castle: { far: '#A6CDB8', near: '#8DC296', tree: '#6FA98A', trunk: '#8F8070', mark: '#B8C0D0', markShade: '#9AA3B5' },
}
/** The track: the soil under the grass, the rails, the sleepers, the buffer stops. */
const SOIL = { body: '#B98A57', dark: '#9C7044', stone: '#CDA578' }
const RAIL = { steel: '#9AA3B5', light: '#D2D8E2', sleeper: '#9A6438', sleeperTop: '#B47B48', buffer: '#FF4A5A', stripe: '#FFFFFF', bumper: '#4A3F4E' }

const TAU = Math.PI * 2
/** The track runs this far past each end of the monster's travel, and its sleepers lie this far apart. */
const OVERRUN = 0.8
const SLEEPERS = 0.55

/** A hill line's height at x: two slow waves, the same for any range. */
function hillAt(x: number, base: number, size: number, seed: number) {
  return base - size * (0.6 + 0.4 * Math.sin(x * 0.42 + seed) + 0.25 * Math.sin(x * 0.93 + 2 * seed))
}

/** One row of hills over [x0, x1], filled down to just under the ground's top. */
function hills(ctx: CanvasRenderingContext2D, x0: number, x1: number, base: number, size: number, seed: number, colour: string) {
  ctx.beginPath()
  ctx.moveTo(x0 - 1, FEED_GROUND + 0.2)
  for (let x = x0 - 1; x <= x1 + 1; x += 0.25) ctx.lineTo(x, hillAt(x, base, size, seed))
  ctx.lineTo(x1 + 1, FEED_GROUND + 0.2)
  ctx.closePath()
  ctx.fillStyle = colour
  ctx.fill()
}

/** A distant tree standing at (x, y): a round crown on a trunk, a pine at the castle, a willow at the pond. */
function distantTree(ctx: CanvasRenderingContext2D, course: CourseId, x: number, y: number, s: number) {
  const d = DISTANT[course]
  ctx.fillStyle = d.trunk
  ctx.fillRect(x - 0.05 * s, y - 0.45 * s, 0.1 * s, 0.45 * s)
  ctx.beginPath()
  if (course === 'castle') {
    for (const [b, w] of [
      [0.3, 0.42],
      [0.6, 0.32],
      [0.88, 0.22],
    ] as const) {
      ctx.moveTo(x - w * s, y - b * s)
      ctx.lineTo(x, y - (b + 0.5) * s)
      ctx.lineTo(x + w * s, y - b * s)
      ctx.closePath()
    }
  } else if (course === 'pond') {
    ctx.moveTo(x - 0.4 * s, y - 0.25 * s)
    ctx.quadraticCurveTo(x - 0.45 * s, y - 1.1 * s, x, y - 1.1 * s)
    ctx.quadraticCurveTo(x + 0.45 * s, y - 1.1 * s, x + 0.4 * s, y - 0.25 * s)
    ctx.closePath()
  } else {
    circlesPath(ctx, [x, y - 0.75 * s, 0.38 * s, x - 0.24 * s, y - 0.6 * s, 0.26 * s, x + 0.24 * s, y - 0.6 * s, 0.26 * s])
  }
  ctx.fillStyle = d.tree
  ctx.fill()
}

/** The course's landmark far off, standing at (x, y): the farm's barn, the castle's castle; the others have only trees. */
function landmark(ctx: CanvasRenderingContext2D, course: CourseId, x: number, y: number) {
  const d = DISTANT[course]
  if (course === 'farm') {
    ctx.fillStyle = d.mark
    ctx.beginPath()
    ctx.moveTo(x - 0.7, y)
    ctx.lineTo(x - 0.7, y - 0.8)
    ctx.lineTo(x, y - 1.3)
    ctx.lineTo(x + 0.7, y - 0.8)
    ctx.lineTo(x + 0.7, y)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = d.markShade
    ctx.fillRect(x - 0.22, y - 0.55, 0.44, 0.55)
  } else if (course === 'castle') {
    ctx.fillStyle = d.mark
    ctx.fillRect(x - 1.1, y - 1.0, 2.2, 1.0)
    for (const tx of [-1.1, 0.7]) {
      ctx.fillRect(x + tx, y - 1.6, 0.4, 1.6)
      for (let k = 0; k < 2; k++) ctx.fillRect(x + tx + k * 0.25, y - 1.75, 0.15, 0.15)
    }
    for (let k = 0; k < 5; k++) ctx.fillRect(x - 0.65 + k * 0.3, y - 1.15, 0.16, 0.15)
    ctx.fillStyle = d.markShade
    ctx.beginPath()
    ctx.moveTo(x - 0.25, y)
    ctx.lineTo(x - 0.25, y - 0.4)
    ctx.arc(x, y - 0.4, 0.25, Math.PI, TAU)
    ctx.lineTo(x + 0.25, y)
    ctx.closePath()
    ctx.fill()
  }
}

/**
 * Everything behind the track over the range x0..x1, y0..y1 (scene tiles): flat sky bands,
 * a soft sun, slow clouds drifting right, two rows of distant hills with trees, all low in
 * contrast and without ink.
 */
export function drawBackdrop(ctx: CanvasRenderingContext2D, course: CourseId, x0: number, x1: number, y0: number, y1: number, t: number) {
  const sky = SKY[course]
  const bottom = Math.max(y1, FEED_GROUND)
  let top = Math.min(y0, 0)
  for (let i = 0; i < sky.length; i++) {
    const end = i < BANDS.length ? BANDS[i]! : bottom
    ctx.fillStyle = sky[i]!
    ctx.fillRect(x0, top, x1 - x0, end - top)
    top = end
  }
  ctx.beginPath()
  ctx.arc(3, 1.9, 1.05, 0, TAU)
  ctx.fillStyle = SUN.halo
  ctx.fill()
  ctx.beginPath()
  ctx.arc(3, 1.9, 0.7, 0, TAU)
  ctx.fillStyle = SUN.disc
  ctx.fill()
  // Clouds: each keeps its own shape and height as it drifts, new ones coming in from the left.
  const drift = t * 0.12
  const gap = 5.3
  for (let i = Math.floor((x0 - 4 - drift) / gap); i <= Math.ceil((x1 + 1 - drift) / gap); i++) {
    const x = i * gap + drift + 1.5 * hash(i, 0, 1)
    const y = 1.0 + 2.4 * hash(i, 0, 2)
    const s = 0.7 + 0.5 * hash(i, 0, 3)
    circlesPath(ctx, [x, y, 0.5 * s, x + 0.6 * s, y + 0.12 * s, 0.4 * s, x - 0.6 * s, y + 0.15 * s, 0.36 * s, x + 0.2 * s, y - 0.3 * s, 0.38 * s])
    ctx.fillStyle = CLOUD
    ctx.fill()
  }
  const d = DISTANT[course]
  hills(ctx, x0, x1, 7.6, 0.9, 1.3, d.far)
  landmark(ctx, course, 12.4, hillAt(12.4, 7.6, 0.9, 1.3) + 0.25)
  hills(ctx, x0, x1, 8.75, 0.55, 4.1, d.near)
  for (let i = Math.floor((x0 - 1) / 1.9); i <= Math.ceil((x1 + 1) / 1.9); i++) {
    if (hash(i, 1, 4) < 0.35) continue
    const x = i * 1.9 + 0.7 * hash(i, 1, 5)
    distantTree(ctx, course, x, hillAt(x, 8.75, 0.55, 4.1) + 0.12, 0.8 + 0.5 * hash(i, 1, 6))
  }
}

/** A buffer stop at the track's end at x, facing the track on the side `face` (+1 the track lies to its right): a striped frame with two rubber bumpers. */
function bufferStop(ctx: CanvasRenderingContext2D, x: number, face: 1 | -1) {
  const g = FEED_GROUND
  const frame = (c: CanvasRenderingContext2D) => roundRectPath(c, x - 0.2, g - 0.62, 0.4, 0.62, 0.05)
  inked(ctx, frame, RAIL.buffer)
  ctx.save()
  frame(ctx)
  ctx.clip()
  ctx.beginPath()
  for (let k = -1; k < 4; k++) {
    const y = g - 0.62 + k * 0.22
    ctx.moveTo(x - 0.2, y)
    ctx.lineTo(x + 0.2, y + 0.16)
    ctx.lineTo(x + 0.2, y + 0.27)
    ctx.lineTo(x - 0.2, y + 0.11)
    ctx.closePath()
  }
  ctx.fillStyle = RAIL.stripe
  ctx.fill()
  ctx.restore()
  for (const y of [g - 0.47, g - 0.2]) inkOval(ctx, x + face * 0.26, y, 0.07, 0.08, RAIL.bumper)
  inked(ctx, (c) => roundRectPath(c, x - 0.26, g - 0.7, 0.52, 0.1, 0.04), RAIL.buffer)
  shine(ctx, 0.025, x - 0.18, g - 0.665, x + 0.1, g - 0.665)
}

/**
 * The ground from FEED_GROUND down (the course's grass with a tufted top edge, soil under
 * it with stones) over x0..x1, and the monster's rails along the ground's top from
 * TRACK_L - 0.8 to TRACK_R + 0.8: a steel rail whose top is FEED_GROUND, on sleepers, with a
 * buffer stop at each end. The track is play layer, so it is inked.
 */
export function drawTrack(ctx: CanvasRenderingContext2D, course: CourseId, x0: number, x1: number, t: number) {
  const L = LAND[course]
  const g = FEED_GROUND
  ctx.fillStyle = SOIL.body
  ctx.fillRect(x0, g + 0.32, x1 - x0, FEED_H + 6 - g)
  ctx.beginPath()
  for (let i = Math.floor(x0 / 0.7); i <= Math.ceil(x1 / 0.7); i++) {
    const x = i * 0.7 + 0.4 * hash(i, 2, 1)
    const y = g + 0.5 + 0.5 * hash(i, 2, 2)
    ctx.moveTo(x + 0.07, y)
    ctx.ellipse(x, y, 0.07, 0.045, 0, 0, TAU)
  }
  ctx.fillStyle = SOIL.stone
  ctx.fill()
  ctx.fillStyle = SOIL.dark
  ctx.fillRect(x0, g + 0.3, x1 - x0, 0.06)
  // The grass: a band with a lighter lip and tufts standing up along its top, swaying a little.
  ctx.fillStyle = L.grass
  ctx.fillRect(x0, g, x1 - x0, 0.32)
  ctx.fillStyle = L.grassLight
  ctx.fillRect(x0, g, x1 - x0, 0.06)
  ctx.beginPath()
  const sway = 0.02 * Math.sin(t * 1.3)
  for (let i = Math.floor(x0 / 0.3); i <= Math.ceil(x1 / 0.3); i++) {
    const x = i * 0.3 + 0.15 * hash(i, 3, 1)
    const h = 0.08 + 0.08 * hash(i, 3, 2)
    ctx.moveTo(x - 0.05, g + 0.01)
    ctx.lineTo(x + sway, g - h)
    ctx.lineTo(x + 0.05, g + 0.01)
    ctx.closePath()
  }
  ctx.fillStyle = L.grass
  ctx.fill()
  // The track: sleepers under the rail, the rail, the buffer stops.
  const a = TRACK_L - OVERRUN
  const b = TRACK_R + OVERRUN
  for (let x = a + 0.2; x < b; x += SLEEPERS) {
    inked(ctx, (c) => roundRectPath(c, x - 0.14, g + 0.03, 0.28, 0.14, 0.03), RAIL.sleeper, LINE_DETAIL)
    ctx.fillStyle = RAIL.sleeperTop
    ctx.fillRect(x - 0.11, g + 0.05, 0.22, 0.03)
  }
  const rail = (c: CanvasRenderingContext2D) => roundRectPath(c, a, g, b - a, 0.09, 0.03)
  inked(ctx, rail, RAIL.steel, LINE)
  ctx.beginPath()
  ctx.moveTo(a + 0.05, g + 0.025)
  ctx.lineTo(b - 0.05, g + 0.025)
  ctx.lineWidth = lw(0.025)
  ctx.lineCap = 'round'
  ctx.strokeStyle = RAIL.light
  ctx.stroke()
  bufferStop(ctx, a - 0.2, 1)
  bufferStop(ctx, b + 0.2, -1)
  ctx.beginPath()
  ctx.moveTo(a, g + 0.09)
  ctx.lineTo(b, g + 0.09)
  ctx.lineWidth = lw(LINE_DETAIL)
  ctx.strokeStyle = INK
  ctx.stroke()
}

const PLACES: readonly CourseId[] = ['park', 'pond', 'garden', 'farm', 'castle']

export const SHEET = (): SheetEntry[] =>
  PLACES.flatMap((course): SheetEntry[] =>
    [
      [0, FEED_W],
      [-7, FEED_W + 7],
    ].map(([x0, x1]) => ({
      label: `${course} ${x0}..${x1}`,
      box: { x: x0!, y: -0.5, w: x1! - x0!, h: FEED_H + 1 },
      draw: (ctx, t) => {
        drawBackdrop(ctx, course, x0!, x1!, -0.5, FEED_H + 0.5, t)
        drawTrack(ctx, course, x0!, x1!, t)
      },
    })),
  )
