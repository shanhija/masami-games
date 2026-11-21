import { DEFAULT_LOOK } from '../game/catalog'
import { TRUCK, rect } from '../game/layout'
import { GOODS, type Good, type Look } from '../game/model'
import { drawCat } from './animals'
import { drawRig, earFlick, posed } from './builder'
import { drawGood } from './goods'
import {
  BOX,
  C,
  INK,
  TAU,
  arch,
  at,
  circlePath,
  clamp01,
  detail,
  groundShadow,
  heartPath,
  ink,
  loop,
  lw,
  part,
  puff,
  roundRectPath,
  scaled,
  shine,
  smooth,
  sparklePath,
  squash,
  starPath,
  tube,
  type SheetEntry,
} from './look'

/**
 * The truck: a chunky safety-yellow dump truck with a cab, the builder at the wheel, Socks
 * the cat in the passenger window, the bed and its heap of goods, cat ears on the roof lamp,
 * and a sticker for every trip driven on the door and the tailgate end of the bed. 4.4 m
 * long, 2.3 m to the cab roof; origin at the ground under its middle, facing right; the
 * caller rotates it for the tilt.
 *
 * It is a vehicle, inked at the edge weight round the cab and the bed, with the made-thing
 * faces where they read: the cab's roof is a lit top face and its nose (the grille, the
 * windscreen, the headlight) a dark right face receding up-right, and the bed is open on top
 * so its load heaps over the rim: up to thirty goods in a mound that teeters as it drives
 * and slides back to the tailgate as the bed tips. With the builder out (at a boulder) the
 * door stands open; on a honk the cab squashes and Socks pops up, wide-eyed then smiling.
 */
export interface TruckPic {
  look: Look
  bed: readonly Good[]
  /** 0 the bed flat, 1 tipped all the way. */
  tip: number
  /** Metres the wheels have rolled: the spokes turn by roll / wheel radius. */
  roll: number
  /** Speed in m/s: exhaust puffs, the cab's bob, the heap's teeter, the builder's ears fold back at top speed. */
  speed: number
  /** Seconds since the horn honked, and since a good last landed in the bed (the ears flick, the newest good settles); Infinity for long ago. */
  honk: number
  flick: number
  /** Trips driven: one sticker each, up to twelve, on the door and the tailgate end. */
  stickers: number
  /** The builder is at the wheel (false while they are out breaking a boulder: the door stands open). */
  driver: boolean
  t: number
}

/** The truck's own colours: the tail light, the seat and the wheel, the cab's inside, the puffs. */
const TRUCK_LOOK = {
  tail: '#FF5A5A',
  seat: '#2E6BE6',
  wheel: '#2A2E3B',
  inside: BOX.asphalt.side,
  puff: '#ECEEF3',
  lamp: BOX.orange,
} as const

/** The stickers, one per trip in this order and then round again: eight simple shapes, each in its own colour, on a white die-cut edge. */
const STICKERS = [
  { shape: 'star', colour: C.rainbow[2] },
  { shape: 'heart', colour: C.heart },
  { shape: 'flower', colour: C.rainbow[5] },
  { shape: 'sparkle', colour: C.rainbow[4] },
  { shape: 'moon', colour: C.rainbow[1] },
  { shape: 'paw', colour: C.confetti[5] },
  { shape: 'ball', colour: C.rainbow[0] },
  { shape: 'leaf', colour: C.rainbow[3] },
] as const
type Sticker = (typeof STICKERS)[number]['shape']

/** Speed (m/s) at which the ears lie flat and the puffs are biggest. */
const TOP_SPEED = 8

// The truck's measures, origin on the ground under its middle.
const W = TRUCK.wheel
const AXLES = [-TRUCK.wheelBase / 2, TRUCK.wheelBase / 2] as const
/** The cab's side face, and how far its roof and nose recede. */
const CAB = { x: 0.72, y: -2.14, w: 1.32, h: 1.36, r: 0.16 }
const CAB_D = 0.16
const WINDOW = { x: 1.22, y: -2.06, w: 0.72, h: 0.86, r: 0.1 }
const BACK_WINDOW = { x: 0.84, y: -2.06, w: 0.3, h: 0.52, r: 0.08 }
/** Socks is drawn this much over SIZE.cat, so the head fills the back window as a passenger's does. */
const SOCKS_K = 1.15
/** The door: from its seam to the cab's front, from the roof to the sill; it opens on its front edge toward the viewer, by DOOR_OUT. */
const DOOR = { x: 1.17, y: -2.1, w: 0.8, h: 1.26, r: 0.1 }
const DOOR_OUT = 0.42
/** The bed's near wall, the depth of its open top, and the hinge it tips on. */
const BED = { x: -2.16, y: -1.52, w: 2.7, h: 0.6 }
const BED_D = 0.26
const HINGE = { x: -2.1, y: -0.9 }
/** The bed tips up this far (radians) at tip 1. */
const TIP_ANGLE = 0.8
/** Where the builder's feet go in the cab, and the steering wheel their hands hold. */
const SEAT = { x: 1.34, y: -0.9 }
const STEER = { x: 1.68, y: -1.33 }

/** The heap: rows of 8, 7, 6, 5, 3 and 1 goods (thirty in all), SPACING apart along the bed and each row STEP higher, every good drawn at SCALE. */
const HEAP_ROWS = [8, 7, 6, 5, 3, 1] as const
const HEAP = { spacing: 0.32, step: 0.2, scale: 0.72 }
/** The heap's slots, filled middle first, row by row from the bottom: [x, y, row]. The bottom row sits in the bed behind its near wall; the top one peaks a little over the cab. */
const BED_SLOTS: readonly (readonly [number, number, number])[] = (() => {
  const out: [number, number, number][] = []
  const mid = BED.x + BED.w / 2 + BED_D / 2
  HEAP_ROWS.forEach((n, row) => {
    const xs = Array.from({ length: n }, (_, i) => mid + (i - (n - 1) / 2) * HEAP.spacing)
    xs.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid))
    for (const x of xs) out.push([x, BED.y + 0.22 - BED_D / 2 - row * HEAP.step, row])
  })
  return out
})()
/** The newest good settles into the heap with a squash over this long after it lands. */
const SETTLE = 0.45

/** Where the stickers go: two rows of three on the door under the window, then two rows of three on the tailgate end of the bed. */
const STICKER_SPOTS: readonly (readonly [number, number])[] = [
  ...[0, 1, 2, 3, 4, 5].map((i) => [1.43 + (i % 3) * 0.17, -1.07 + Math.floor(i / 3) * 0.15] as const),
  ...[0, 1, 2, 3, 4, 5].map((i) => [BED.x + 0.18 + (i % 3) * 0.13, BED.y + 0.2 + Math.floor(i / 3) * 0.17] as const),
]
/** A sticker's size, tip to tip; the first DOOR_STICKERS go on the door. */
const STICKER = 0.12
const DOOR_STICKERS = 6

/** A wheel at (x, y), its five spokes turned by `turn`. */
function drawWheel(ctx: CanvasRenderingContext2D, x: number, y: number, turn: number) {
  circlePath(ctx, x, y, W)
  part(ctx, C.tyre, 'edge')
  circlePath(ctx, x, y, W * 0.52)
  part(ctx, C.hub, 'line')
  ctx.beginPath()
  for (let i = 0; i < 5; i++) {
    const a = turn + (i / 5) * TAU
    ctx.moveTo(x + Math.cos(a) * W * 0.14, y + Math.sin(a) * W * 0.14)
    ctx.lineTo(x + Math.cos(a) * W * 0.44, y + Math.sin(a) * W * 0.44)
  }
  ctx.lineCap = 'round'
  ink(ctx, 'line')
  circlePath(ctx, x, y, W * 0.14)
  part(ctx, BOX.steel.side, 'line')
}

/** Socks the cat (animals.ts's black and white cat) peeking over the back window's sill, paws on it, looking about; a honk makes Socks pop up wide-eyed, then smile and wave. */
function drawSocks(ctx: CanvasRenderingContext2D, t: number, honk: number, lod: 'S' | 'M' | 'L') {
  const look = loop(t, 5, 0.3)
  const startled = honk >= 0 && honk < 1.2
  const glad = startled && honk >= 0.45
  ctx.save()
  ctx.translate(BACK_WINDOW.x + BACK_WINDOW.w / 2, BACK_WINDOW.y + BACK_WINDOW.h)
  scaled(ctx, SOCKS_K, () =>
    drawCat(
      ctx,
      {
        coat: 'tuxedo',
        pose: 'peek',
        eyes: startled ? (glad ? 'happy' : 'wide') : loop(t, 4.1, 0.6) > 0.96 ? 'closed' : 'open',
        meow: glad,
        tail: 0,
        lift: startled ? 0.07 * arch(Math.min(1, honk / 0.5)) : 0,
        tilt: startled ? 0 : 0.12 * Math.sin(TAU * look) * (look < 0.5 ? 1 : 0),
        step: 0,
        wave: glad ? (0.75 + 0.2 * Math.sin(TAU * 5 * honk)) * (1 - smooth(0.9, 1.2, honk)) : 0,
        kitten: false,
      },
      lod,
    ),
  )
  ctx.restore()
}

/** The cab's roof lamp: an orange dome with two cat ears, flicking when a good lands. */
function drawLamp(ctx: CanvasRenderingContext2D, flick: number) {
  const x = CAB.x + CAB.w * 0.5 + CAB_D / 2
  const y = CAB.y - CAB_D / 2
  const wob = earFlick(flick)
  for (const s of [-1, 1] as const) {
    ctx.save()
    ctx.translate(x + s * 0.09, y - 0.14)
    ctx.rotate(s * 0.25 + wob * s)
    ctx.beginPath()
    ctx.moveTo(-0.06, 0.02)
    ctx.lineTo(0, -0.13)
    ctx.lineTo(0.06, 0.02)
    ctx.closePath()
    part(ctx, TRUCK_LOOK.lamp.face, 'line')
    ctx.beginPath()
    ctx.moveTo(-0.03, 0.0)
    ctx.lineTo(0, -0.075)
    ctx.lineTo(0.03, 0.0)
    ctx.closePath()
    ctx.fillStyle = C.innerEar
    ctx.fill()
    ctx.restore()
  }
  ctx.beginPath()
  ctx.rect(x - 0.17, y - 0.05, 0.34, 0.07)
  part(ctx, BOX.steel.side, 'line')
  ctx.beginPath()
  ctx.arc(x, y - 0.05, 0.15, Math.PI, TAU)
  ctx.closePath()
  part(ctx, TRUCK_LOOK.lamp.face, 'line')
  shine(ctx, x, y - 0.05, 0.15)
}

/** A sticker's outline at (x, y), `r` its half size: a fresh path. */
function stickerPath(ctx: CanvasRenderingContext2D, shape: Sticker, x: number, y: number, r: number) {
  switch (shape) {
    case 'star':
      starPath(ctx, x, y + r * 0.08, r * 1.05)
      return
    case 'heart':
      heartPath(ctx, x, y, r * 2)
      return
    case 'sparkle':
      sparklePath(ctx, x, y, r * 2.2)
      return
    case 'ball':
      circlePath(ctx, x, y, r * 0.85)
      return
    case 'moon':
      ctx.beginPath()
      ctx.arc(x, y, r, 0.6, TAU - 0.6)
      ctx.arc(x + r * 0.5, y - r * 0.05, r * 0.72, -1.1, 1.1, true)
      ctx.closePath()
      return
    case 'leaf':
      ctx.beginPath()
      ctx.moveTo(x - r, y + r * 0.6)
      ctx.quadraticCurveTo(x - r * 0.9, y - r * 0.9, x + r, y - r * 0.8)
      ctx.quadraticCurveTo(x + r * 0.8, y + r * 0.8, x - r, y + r * 0.6)
      ctx.closePath()
      return
    case 'flower':
    case 'paw': {
      // Five petals round a middle, or four toes over a pad: circles as one path.
      ctx.beginPath()
      const dots: [number, number, number][] =
        shape === 'flower'
          ? Array.from({ length: 5 }, (_, k) => [x + Math.cos((k * TAU) / 5 - Math.PI / 2) * r * 0.55, y + Math.sin((k * TAU) / 5 - Math.PI / 2) * r * 0.55, r * 0.45])
          : [
              [x - r * 0.62, y - r * 0.2, r * 0.25],
              [x - r * 0.24, y - r * 0.62, r * 0.25],
              [x + r * 0.24, y - r * 0.62, r * 0.25],
              [x + r * 0.62, y - r * 0.2, r * 0.25],
              [x, y + r * 0.3, r * 0.5],
            ]
      for (const [cx, cy, cr] of dots) {
        ctx.moveTo(cx + cr, cy)
        ctx.arc(cx, cy, cr, 0, TAU)
      }
    }
  }
}

/** The stickers from the `from`th up to (not with) the `to`th, at their spots and in the order of STICKERS: each on its white die-cut edge, finely inked. */
function drawStickers(ctx: CanvasRenderingContext2D, from: number, to: number, fine: boolean) {
  const r = STICKER / 2
  for (let i = from; i < Math.min(to, STICKER_SPOTS.length); i++) {
    const [x, y] = STICKER_SPOTS[i]!
    const { shape, colour } = STICKERS[i % STICKERS.length]!
    stickerPath(ctx, shape, x, y, r)
    ctx.lineJoin = 'round'
    ctx.lineWidth = r * 0.5
    ctx.strokeStyle = C.white
    ctx.stroke()
    ctx.fillStyle = colour
    ctx.fill()
    if (fine) ink(ctx, 'detail')
    if (shape === 'flower') {
      circlePath(ctx, x, y, r * 0.3)
      ctx.fillStyle = C.rainbow[2]
      ctx.fill()
    }
  }
}

/** The exhaust stack behind the cab, and its puffs: more, bigger and blown further back the faster it goes. */
function drawExhaust(ctx: CanvasRenderingContext2D, speed: number, t: number) {
  const x = CAB.x - 0.08
  const top = CAB.y - 0.12
  const k = clamp01(speed / TOP_SPEED)
  const n = 2 + Math.round(3 * k)
  for (let i = 0; i < n; i++) {
    const u = loop(t, 1.4 - 0.7 * k, i / n)
    // Each puff grows as it drifts, then shrinks away (no fading: a fading blob shows its inner rings).
    puff(ctx, x - (0.1 + 1.3 * k) * u, top - 0.12 - (0.5 - 0.3 * k) * u, (0.05 + 0.09 * k) * (0.6 + u) * (1 - smooth(0.7, 1, u)), TRUCK_LOOK.puff)
  }
  ctx.beginPath()
  ctx.moveTo(x, -0.9)
  ctx.lineTo(x, top)
  ctx.lineCap = 'round'
  tube(ctx, 0.07, BOX.steel.face)
}

/** The bed and its load, tipped about the hinge by `tip`: the heap teeters at speed, the newest good settles in, and on a tip the load slides back to the tailgate as it swings open. */
function drawBed(ctx: CanvasRenderingContext2D, p: TruckPic, fine: boolean) {
  const yellow = BOX.yellow
  const t = p.t
  const lift = smooth(0, 1, p.tip)
  const slide = smooth(0.15, 0.85, p.tip)
  const shake = 0.35 + 0.65 * clamp01(p.speed / 3)
  ctx.save()
  ctx.translate(HINGE.x, HINGE.y)
  ctx.rotate(-TIP_ANGLE * lift)
  ctx.translate(-HINGE.x, -HINGE.y)
  // The open top: the inside of the far wall and the floor.
  ctx.beginPath()
  ctx.moveTo(BED.x, BED.y)
  ctx.lineTo(BED.x + BED_D, BED.y - BED_D)
  ctx.lineTo(BED.x + BED.w + BED_D, BED.y - BED_D)
  ctx.lineTo(BED.x + BED.w, BED.y)
  ctx.closePath()
  part(ctx, yellow.side, 'line')
  // The load, lowest row first; the top rows teeter, the newest good drops in and settles.
  const n = Math.min(p.bed.length, BED_SLOTS.length)
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => BED_SLOTS[b]![1] - BED_SLOTS[a]![1] || BED_SLOTS[a]![0] - BED_SLOTS[b]![0])
  const back = BED.x + 0.32
  const settle = p.flick >= 0 && p.flick < SETTLE ? p.flick : -1
  for (const i of order) {
    const [sx, sy, row] = BED_SLOTS[i]!
    const x = sx - slide * (sx - back) * 0.55
    const y = sy + slide * row * HEAP.step * 0.45
    const teeter = row >= 2 ? (0.02 + 0.012 * row) * shake * Math.sin(TAU * (t * 1.25 + i * 0.29)) : 0
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(((i * 5) % 7) * 0.04 - 0.12 + teeter)
    if (i === n - 1 && settle >= 0) {
      const [qx, qy] = squash(settle)
      ctx.translate(0, -0.25 * (1 - smooth(0, 0.12, settle)))
      ctx.scale(qx, qy)
    }
    ctx.scale(HEAP.scale, HEAP.scale)
    drawGood(ctx, p.bed[i]!, t + i * 0.3)
    ctx.restore()
  }
  // The near wall with its ribs, a tail light at the back.
  roundRectPath(ctx, BED.x, BED.y, BED.w, BED.h, 0.06)
  part(ctx, yellow.face, 'edge')
  ctx.beginPath()
  for (const rx of [0.62, 1.4, 2.18]) {
    ctx.moveTo(BED.x + rx, BED.y + 0.08)
    ctx.lineTo(BED.x + rx, BED.y + BED.h - 0.08)
  }
  ctx.lineCap = 'round'
  tube(ctx, 0.07, yellow.top)
  ctx.beginPath()
  ctx.moveTo(BED.x + 0.04, BED.y + 0.06)
  ctx.lineTo(BED.x + BED.w - 0.04, BED.y + 0.06)
  ctx.lineWidth = lw('line')
  ctx.strokeStyle = yellow.side
  ctx.stroke()
  roundRectPath(ctx, BED.x - 0.04, BED.y + BED.h - 0.24, 0.1, 0.16, 0.03)
  part(ctx, TRUCK_LOOK.tail, 'line')
  if (fine) {
    circlePath(ctx, BED.x + BED.w - 0.2, BED.y + BED.h - 0.12, 0.025)
    part(ctx, yellow.top, 'detail')
  }
  // The tailgate on its top hinge: it hangs straight down as the bed tips, so it swings open.
  ctx.save()
  ctx.translate(BED.x - 0.02, BED.y - 0.04)
  ctx.rotate(TIP_ANGLE * lift * 1.1)
  roundRectPath(ctx, -0.07, 0, 0.1, BED.h + 0.02, 0.03)
  part(ctx, yellow.side, 'line')
  circlePath(ctx, -0.02, 0.03, 0.03)
  part(ctx, BOX.steel.side, 'detail')
  ctx.restore()
  drawStickers(ctx, DOOR_STICKERS, p.stickers, fine)
  ctx.restore()
}

/** The cab's inside through the door's window or its open doorway: the seat back, the wheel on its column, and the builder at it. */
function drawInside(ctx: CanvasRenderingContext2D, p: TruckPic, open: boolean) {
  ctx.save()
  if (open) roundRectPath(ctx, DOOR.x, DOOR.y, DOOR.w, DOOR.h, DOOR.r)
  else roundRectPath(ctx, WINDOW.x, WINDOW.y, WINDOW.w, WINDOW.h, WINDOW.r)
  ctx.clip()
  if (open) {
    roundRectPath(ctx, DOOR.x, DOOR.y, DOOR.w, DOOR.h, DOOR.r)
    part(ctx, TRUCK_LOOK.inside, 'line')
    // The seat's cushion and the step up into the cab.
    roundRectPath(ctx, WINDOW.x - 0.06, -1.06, 0.48, 0.14, 0.05)
    part(ctx, TRUCK_LOOK.seat, 'line')
    ctx.beginPath()
    ctx.rect(DOOR.x + 0.1, -0.98, DOOR.w - 0.2, 0.06)
    part(ctx, BOX.steel.top, 'detail')
  }
  roundRectPath(ctx, WINDOW.x - 0.04, -1.74, 0.16, 0.7, 0.06)
  part(ctx, TRUCK_LOOK.seat, 'line')
  ctx.save()
  ctx.translate(STEER.x, STEER.y)
  ctx.rotate(-1.15)
  ctx.beginPath()
  ctx.ellipse(0, 0, 0.17, 0.04, 0, 0, TAU)
  part(ctx, TRUCK_LOOK.wheel, 'line')
  ctx.restore()
  ctx.beginPath()
  ctx.moveTo(STEER.x, STEER.y)
  ctx.lineTo(STEER.x + 0.12, STEER.y + 0.25)
  ctx.lineCap = 'round'
  tube(ctx, 0.04, TRUCK_LOOK.wheel)
  if (p.driver) {
    // Ears laid back at top speed; a grin on a honk.
    const happy = p.honk >= 0 && p.honk < 0.9
    const pose = posed('drive', p.t)
    const rig = { ...pose, flick: earFlick(p.flick), fold: smooth(0.6, 1, clamp01(p.speed / TOP_SPEED)), mouth: happy || pose.mouth, eyes: happy ? ('happy' as const) : pose.eyes }
    ctx.save()
    ctx.translate(SEAT.x, SEAT.y)
    drawRig(ctx, p.look, rig)
    ctx.restore()
  }
  ctx.restore()
}

/** The door swung open toward the viewer on its front edge: its inner face, its window frame, the handle. */
function drawOpenDoor(ctx: CanvasRenderingContext2D) {
  const hx = DOOR.x + DOOR.w
  const fx = hx - DOOR_OUT
  const dy = DOOR_OUT
  const yellow = BOX.yellow
  ctx.beginPath()
  ctx.moveTo(hx, DOOR.y + 0.04)
  ctx.lineTo(fx, DOOR.y + dy)
  ctx.lineTo(fx, DOOR.y + DOOR.h + dy - 0.06)
  ctx.lineTo(hx, DOOR.y + DOOR.h)
  ctx.closePath()
  part(ctx, yellow.side, 'edge')
  // The window in the door, seen from inside.
  ctx.beginPath()
  ctx.moveTo(hx - 0.05, DOOR.y + 0.12)
  ctx.lineTo(fx + 0.05, DOOR.y + dy + 0.06)
  ctx.lineTo(fx + 0.05, DOOR.y + dy + 0.66)
  ctx.lineTo(hx - 0.05, DOOR.y + 0.74)
  ctx.closePath()
  part(ctx, C.glassTint, 'line')
  ctx.beginPath()
  ctx.moveTo(fx + 0.1, DOOR.y + dy + 0.84)
  ctx.lineTo(fx + 0.2, DOOR.y + dy + 0.8)
  ctx.lineCap = 'round'
  tube(ctx, 0.03, BOX.steel.top)
}

/** The truck as `p` pictures it, origin on the ground under its middle, facing right. */
export function drawTruck(ctx: CanvasRenderingContext2D, p: TruckPic): void {
  const yellow = BOX.yellow
  const t = p.t
  const lod = detail(TRUCK.height)
  const fine = lod !== 'S'
  const bob = 0.02 * Math.sin(TAU * 3.2 * t) * clamp01(p.speed / 2)
  const turn = p.roll / W
  const [hx, hy] = squash(p.honk)
  ctx.save()
  ctx.lineJoin = 'round'
  groundShadow(ctx, 4.3)

  // The chassis and the ram that tips the bed.
  roundRectPath(ctx, -2.12, -0.98, 4.1, 0.22, 0.05)
  part(ctx, BOX.asphalt.face, 'edge')
  if (p.tip > 0) {
    const a = -TIP_ANGLE * smooth(0, 1, p.tip)
    const bx = HINGE.x + Math.cos(a) * 2.1
    const by = HINGE.y + Math.sin(a) * 2.1
    ctx.beginPath()
    ctx.moveTo(0.1, -0.95)
    ctx.lineTo(bx, by)
    ctx.lineCap = 'round'
    tube(ctx, 0.1, BOX.steel.face)
  }

  ctx.save()
  ctx.translate(0, bob)
  drawBed(ctx, p, fine)
  drawExhaust(ctx, p.speed, t)

  // The cab, squashing on a honk about its bottom.
  ctx.save()
  ctx.translate(CAB.x + CAB.w / 2, -0.78)
  ctx.scale(hx, hy)
  ctx.translate(-(CAB.x + CAB.w / 2), 0.78)
  // Roof (lit top face) and nose (dark right face), then the side.
  ctx.beginPath()
  ctx.moveTo(CAB.x + CAB.r, CAB.y)
  ctx.lineTo(CAB.x + CAB.r + CAB_D, CAB.y - CAB_D)
  ctx.lineTo(CAB.x + CAB.w + CAB_D, CAB.y - CAB_D)
  ctx.lineTo(CAB.x + CAB.w, CAB.y)
  ctx.closePath()
  part(ctx, yellow.top, 'line')
  ctx.beginPath()
  ctx.moveTo(CAB.x + CAB.w, CAB.y)
  ctx.lineTo(CAB.x + CAB.w + CAB_D, CAB.y - CAB_D)
  ctx.lineTo(CAB.x + CAB.w + CAB_D, -0.78 - CAB_D)
  ctx.lineTo(CAB.x + CAB.w, -0.78)
  ctx.closePath()
  part(ctx, yellow.side, 'line')
  // The windscreen and the headlight on the nose.
  ctx.beginPath()
  ctx.moveTo(CAB.x + CAB.w, CAB.y + 0.1)
  ctx.lineTo(CAB.x + CAB.w + CAB_D, CAB.y + 0.1 - CAB_D)
  ctx.lineTo(CAB.x + CAB.w + CAB_D, -1.25 - CAB_D)
  ctx.lineTo(CAB.x + CAB.w, -1.25)
  ctx.closePath()
  part(ctx, C.glassTint, 'detail')
  ctx.beginPath()
  ctx.ellipse(CAB.x + CAB.w + CAB_D / 2, -1.02 - CAB_D / 2, CAB_D * 0.38, 0.09, 0, 0, TAU)
  part(ctx, C.sparkleWarm, 'detail')
  roundRectPath(ctx, CAB.x, CAB.y, CAB.w, CAB.h, CAB.r)
  part(ctx, yellow.face, 'edge')

  // The windows: the cab's inside shows through the glass behind the driver and Socks; with the builder out the door stands open.
  const open = !p.driver
  roundRectPath(ctx, BACK_WINDOW.x, BACK_WINDOW.y, BACK_WINDOW.w, BACK_WINDOW.h, BACK_WINDOW.r)
  part(ctx, C.glassTint, 'line')
  if (!open) {
    roundRectPath(ctx, WINDOW.x, WINDOW.y, WINDOW.w, WINDOW.h, WINDOW.r)
    part(ctx, C.glassTint, 'line')
  }
  ctx.save()
  roundRectPath(ctx, BACK_WINDOW.x, BACK_WINDOW.y, BACK_WINDOW.w, BACK_WINDOW.h, BACK_WINDOW.r)
  ctx.clip()
  drawSocks(ctx, t, p.honk, lod)
  ctx.restore()
  drawInside(ctx, p, open)
  // A white glint on each window, the frames over the edge.
  const glass = open ? [BACK_WINDOW] : [WINDOW, BACK_WINDOW]
  ctx.beginPath()
  for (const wdw of glass) {
    ctx.moveTo(wdw.x + wdw.w - 0.08, wdw.y + 0.07)
    ctx.lineTo(wdw.x + wdw.w - 0.2, wdw.y + 0.24)
  }
  if (!open) {
    ctx.moveTo(WINDOW.x + WINDOW.w - 0.08, WINDOW.y + 0.22)
    ctx.lineTo(WINDOW.x + WINDOW.w - 0.13, WINDOW.y + 0.3)
  }
  ctx.lineCap = 'round'
  ctx.lineWidth = Math.max(lw('line'), 0.035)
  ctx.strokeStyle = C.white
  ctx.stroke()
  for (const wdw of glass) {
    roundRectPath(ctx, wdw.x, wdw.y, wdw.w, wdw.h, wdw.r)
    ink(ctx, 'line')
  }
  if (open) drawOpenDoor(ctx)
  else {
    // The door: its seam, a handle, the stickers.
    ctx.beginPath()
    ctx.moveTo(WINDOW.x - 0.05, WINDOW.y - 0.02)
    ctx.lineTo(WINDOW.x - 0.05, -0.84)
    ink(ctx, 'line')
    roundRectPath(ctx, WINDOW.x + 0.0, WINDOW.y + WINDOW.h + 0.055, 0.1, 0.04, 0.02)
    part(ctx, BOX.steel.top, 'detail')
    drawStickers(ctx, 0, Math.min(p.stickers, DOOR_STICKERS), fine)
  }
  drawLamp(ctx, p.flick)
  ctx.restore()

  // Mudguards over the wheels, the bumper.
  for (const ax of AXLES) {
    ctx.beginPath()
    ctx.arc(ax, -W, W + 0.07, Math.PI * 1.05, Math.PI * 1.95)
    ctx.lineCap = 'butt'
    ctx.lineWidth = 0.08 + 2 * lw('line')
    ctx.strokeStyle = INK
    ctx.stroke()
    ctx.lineWidth = 0.08
    ctx.strokeStyle = BOX.asphalt.face
    ctx.stroke()
  }
  roundRectPath(ctx, 1.92, -0.86, 0.3, 0.2, 0.05)
  part(ctx, BOX.steel.face, 'line')
  ctx.restore()

  for (const ax of AXLES) drawWheel(ctx, ax, -W, turn)

  if (p.honk >= 0 && p.honk < 0.5) {
    // The horn's "meep meep": three short lines in front of the nose, moving out and getting shorter.
    const u = p.honk / 0.5
    const len = 0.18 * (1 - u)
    ctx.beginPath()
    for (const a of [-0.45, 0, 0.45]) {
      const r0 = 0.15 + 0.25 * u
      ctx.moveTo(2.35 + Math.cos(a) * r0, -1.0 + Math.sin(a) * r0)
      ctx.lineTo(2.35 + Math.cos(a) * (r0 + len), -1.0 + Math.sin(a) * (r0 + len))
    }
    ctx.lineCap = 'round'
    ink(ctx, 'line')
  }
  ctx.restore()
}

// ---------------------------------------------------------------------------------------
// The sheet

const LOAD: readonly Good[] = ['log', 'rock', 'log', 'sand', 'clay', 'gem', 'log', 'rock', 'clay', 'sand', 'log', 'gem', 'rock']
/** A bed of n goods, the raw ones in turn, as a road trip fills it. */
const load = (n: number): Good[] => Array.from({ length: n }, (_, i) => GOODS[(i * 3) % 5]!)
const pic = (patch: Partial<TruckPic>, t: number): TruckPic => ({
  look: DEFAULT_LOOK,
  bed: LOAD,
  tip: 0,
  roll: t * 3,
  speed: 3,
  honk: Infinity,
  flick: Infinity,
  stickers: 4,
  driver: true,
  t,
  ...patch,
})
/** The truck's box reaches 0.2 m under the ground for its shadow. */
const truckBox = rect(-2.5, -2.85, 5.05, 3.05)
/** A tipping truck's box: the raised bed and its goods reach up and back past the truck's own. */
const tipBox = rect(-2.85, -3.7, 5.4, 3.9)
/** A honking truck's box: the horn's lines reach ahead of the bumper. */
const honkBox = rect(-2.5, -2.85, 5.25, 3.05)
const truckAt = (ppm: number, label: string, patch: (t: number) => Partial<TruckPic>, box = truckBox) => at(ppm, box, label, (ctx, t) => drawTruck(ctx, pic(patch(t), t)))

/** ?sheet=truck: the truck driving, parked, at top speed, honking, filling up from one good to overfull, its stickers, tipping, with its door open, and at the road's and the street's sizes. */
export const TRUCK_SHEET: SheetEntry[] = [
  { label: 'driving with a load', box: truckBox, draw: (ctx, t) => drawTruck(ctx, pic({}, t)) },
  { label: 'empty, parked, no stickers yet', box: truckBox, draw: (ctx, t) => drawTruck(ctx, pic({ bed: [], speed: 0, roll: 0, stickers: 0 }, t)) },
  { label: 'top speed: big puffs, ears back', box: truckBox, draw: (ctx, t) => drawTruck(ctx, pic({ speed: 8, roll: t * 8 }, t)) },
  { label: 'honk (replays): Socks pops up', box: honkBox, draw: (ctx, t) => drawTruck(ctx, pic({ honk: t % 2, speed: 0, roll: 0 }, t)) },
  { label: 'a good lands every 1.5 s', box: truckBox, draw: (ctx, t) => drawTruck(ctx, pic({ bed: load(8 + (Math.floor(t / 1.5) % 22)), flick: t % 1.5, speed: 2 }, t)) },
  ...[1, 8, 15, 21, 26, 30, 36].map((n): SheetEntry => ({ label: `${n} goods`, box: truckBox, draw: (ctx, t) => drawTruck(ctx, pic({ bed: load(n), stickers: Math.min(n, 12) }, t)) })),
  ...[1, 6, 7, 8, 12, 20].map((n): SheetEntry => ({ label: `${n} trips' stickers`, box: truckBox, draw: (ctx, t) => drawTruck(ctx, pic({ stickers: n, speed: 0, roll: 0 }, t)) })),
  { label: 'tipping a full bed (replays)', box: tipBox, draw: (ctx, t) => drawTruck(ctx, pic({ bed: load(30 - Math.floor(Math.max(0, (t % 4) - 1) * 10)), tip: Math.min(1, (t % 4) / 1.2) * (1 - smooth(3.4, 4, t % 4)), speed: 0, roll: 0 }, t)) },
  { label: 'builder out: the door stands open', box: truckBox, draw: (ctx, t) => drawTruck(ctx, pic({ driver: false, speed: 0, roll: 0, stickers: 9 }, t)) },
  truckAt(80, 'on the road, 80 px/m', (t) => ({ bed: load(14), speed: 6, roll: t * 6, stickers: 5 })),
  truckAt(80, 'on the road at top speed, 80 px/m', (t) => ({ bed: load(24), speed: 8, roll: t * 8, stickers: 11 })),
  truckAt(48, 'on the street, 48 px/m', () => ({ bed: [], speed: 0, roll: 0, stickers: 7 })),
  truckAt(48, 'tipping on the street, 48 px/m', (t) => ({ bed: load(18), tip: Math.min(1, (t % 3) / 1.2), speed: 0, roll: 0, stickers: 7 }), tipBox),
]
