import { BALL_BOUNCE, BUMP_FOR, POLE_HEIGHT, POLE_STARS, ROWS, SPRING_TOP, since, type BlockDef, type Bubble, type Item, type LiftDef, type Room, type RoomId, type Sim } from '../game/model'
import { COLOR, INK, LINE, LINE_DETAIL, SHADE_BLOCK, SHADE_CHARACTER, blob, bubbleBall, groundShadow, heartPath, inkPart, lw, roundRectPath, sparklePath, starPath } from './look'
import { PAPER_SHADOW, ROOM_LOOK, cornerRectPath, detailed, dim, ellipseSub, hash, inkLine, paintedPart, shine, type RoomLook } from './world'

/**
 * The things in a room that are not terrain or characters. Every function draws in world
 * units around the origin its comment names, in the room's colours (ROOM_LOOK), and leaves
 * the context as it found it.
 */

/** A bumped gift box hops this high and a cookie block COOKIE_HOP, over BUMP_FOR. */
const GIFT_HOP = 0.3
const COOKIE_HOP = 0.25
/** A gift box with nothing left, and its ribbon, as [lit, shade]. */
const EMPTY_BOX = ['#E6D8C6', '#D3C0A9'] as const
const EMPTY_RIBBON = ['#F3ECE2', '#E2D6C6'] as const
/** The bow on a full box wiggles this far (radians) at 0.5 Hz; its loops tilt up BOW_TILT. A sparkle winks at a corner for SPARKLE_FOR every SPARKLE_EVERY seconds. */
const BOW_WIGGLE = (6 * Math.PI) / 180
const BOW_TILT = (25 * Math.PI) / 180
const SPARKLE_EVERY = 3
const SPARKLE_FOR = 0.45
/** The cookie block: dough as [lit, shade], chocolate chips (x, y, r) and crumbs (x, y) in its cell. */
const COOKIE = ['#EDBE7C', '#D19A5A'] as const
const CHIP = '#6E4231'
const CHIPS = [
  [0.3, 0.32, 0.09],
  [0.66, 0.45, 0.075],
  [0.38, 0.7, 0.085],
] as const
const CRUMB = '#E2AE6A'
const CRUMBS = [
  [0.62, 0.2],
  [0.17, 0.53],
  [0.8, 0.72],
  [0.58, 0.8],
] as const
/** The gate: white pickets with pointed tops on lilac rails; it sinks into the floor over GATE_SINK seconds once the Big Grumble is beaten. */
const PICKETS = [0.08, 0.4, 0.72] as const
const PICKET_W = 0.2
const PICKET = '#FFFFFF'
const RAIL = ['#E6DCEB', '#CFC0DA'] as const
const GATE_SINK = 0.6
/** A map star's outer radius. */
const STAR_R = 0.32
/** The cupcake: wrapper stripes [lit, shade] in turn, frosting [lit, shade], sprinkles, the cherry [lit, shade] and its stem. */
const WRAPPER = [
  ['#FF8F7A', '#E8735F'],
  ['#FFEDE3', '#F0D2C3'],
] as const
const FROSTING = ['#FFF6EA', '#F2DCC6'] as const
const SPRINKLES = ['#FF6FAE', '#7FD4FF', '#FFD447', '#8EE59B'] as const
const CHERRY = ['#E83A5A', '#C42747'] as const
const STEM = '#6B8E3B'
/** The frosting's three tiers as circles (x, y, r), wide at the bottom, up to y -0.62. */
const FROSTING_BLOB = [
  -0.22, -0.37, 0.11, -0.11, -0.37, 0.11, 0, -0.37, 0.11, 0.11, -0.37, 0.11, 0.22, -0.37, 0.11,
  -0.15, -0.46, 0.1, -0.05, -0.46, 0.1, 0.05, -0.46, 0.1, 0.15, -0.46, 0.1,
  -0.07, -0.53, 0.09, 0.07, -0.53, 0.09,
] as const
/** Sprinkles on the frosting: x, y, angle, colour index. */
const SPRINKLE_AT = [
  [-0.2, -0.4, 0.5, 0],
  [0.13, -0.41, -0.6, 1],
  [-0.04, -0.47, 1.2, 2],
  [0.22, -0.35, 0.3, 3],
  [-0.13, -0.53, -0.4, 1],
  [0.07, -0.56, 0.8, 0],
] as const
/** A sliding cupcake's jelly wobble: this far (radians) at JELLY_HZ. */
const JELLY = (4 * Math.PI) / 180
const JELLY_HZ = 4
/** The bubble wand: stick [lit, shade] and ring [lit, shade]; a small bubble drifts off every WAND_PUFF seconds. */
const WAND_STICK = ['#FF9CCB', '#E77FB0'] as const
const WAND_RING = ['#FF5FA2', '#E04489'] as const
const WAND_PUFF = 0.8
/** The wand's ring: its middle this high over the feet, its film and outer radius. */
const WAND_Y = 0.55
const WAND_HOLE = 0.12
const WAND_RIM = 0.21
/** The rainbow ball's radius; it squashes to BALL_SQUASH tall as it bounces. */
const BALL_R = 0.3
const BALL_SQUASH = 0.8
/** The spring: coil [lit, shade], how tall the coil is at rest (its base and pad take 0.24, so the pad's top is SPRING_TOP, where the sim bounces her) and its loops, and its squash: held at SPRING_SQUASH for SPRING_HOLD, then three wobbles over SPRING_WOBBLE. */
const COIL = ['#9AA6C8', '#7D89AD'] as const
const COIL_H = SPRING_TOP - 0.24
const COIL_LOOPS = 4
const SPRING_SQUASH = 0.4
const SPRING_HOLD = 0.05
const SPRING_WOBBLE = 0.35
/** The ribbon pole: white with accent stripes every POLE_STRIPE; the streamers are STREAMER long and wave at 1 Hz. */
const POLE_W = 0.22
const POLE_STRIPE = 0.5
const STREAMER = 2.5
/** The kitten's bed: dome size, base cushion, doorway and its rolled rim, pom-pom. */
const BED_W = 2.6
const BED_H = 2.2
const BED_BAND = 0.3
const DOOR_W = 0.95
const DOOR_H = 1.1
const DOORWAY = '#4A2E4F'
const DOOR_RIM = 0.13
const POM = ['#FFFFFF', '#E6DFEF'] as const
/** Glows, each ring adding this much of its colour: the bed on a night room, the picnic's lanterns, the moonlight behind items on a night room. */
const GLOW_RINGS = 5
const BED_GLOW = ['#FFD98A', 0.07] as const
const LANTERN_GLOW = ['#FFE3A0', 0.09] as const
const ITEM_GLOW = [COLOR.nightRim, 0.06] as const
/** The picnic: lantern papers, their caps and the posts, the cake and its icing, candle colours and flames. */
const LANTERNS = [
  ['#FFB3C7', '#EE93AC'],
  ['#FFD98A', '#EDBE63'],
] as const
const LANTERN_CAP = '#6E6AA8'
const POST = ['#C99B6B', '#A97E52'] as const
const CAKE = ['#FFF4F7', '#EED9E2'] as const
const ICING = ['#FF9EBB', '#E681A1'] as const
const CANDLES = ['#7FD4FF', '#FFD447', '#8EE59B'] as const
const FLAME = ['#FFD447', '#FF9F43'] as const

/** Seconds since a tick stamp, never negative (the picture runs up to a step behind the sim), Infinity for a stamp of -1. */
const ago = (at: number, t: number) => Math.max(0, since(at, t))

/** Fills a shape's flat paper shadow, PAPER_SHADOW to the right and down. */
function paperShadow(ctx: CanvasRenderingContext2D, trace: (ctx: CanvasRenderingContext2D) => void) {
  ctx.save()
  ctx.translate(PAPER_SHADOW[0], PAPER_SHADOW[1])
  trace(ctx)
  ctx.fillStyle = COLOR.paper
  ctx.fill()
  ctx.restore()
}

/** A soft glow round (x, y): GLOW_RINGS discs from radius r in to 0.4 r, each a little more of `colour`, so it fades out at its edge. */
function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, colour: string, alpha: number) {
  ctx.save()
  ctx.fillStyle = colour
  ctx.globalAlpha *= alpha
  for (let i = 0; i < GLOW_RINGS; i++) {
    ctx.beginPath()
    ctx.arc(x, y, r * (1 - (0.6 * i) / GLOW_RINGS), 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

/** Starts a context the way every thing draws: saved, round joins and caps. */
function begin(ctx: CanvasRenderingContext2D) {
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
}

/** Block `index` of the room (a gift box, a cookie block or a gate), origin at its cell's top-left, hopping for BUMP_FOR after a bump, sinking after the gate opens. */
export function drawBlock(ctx: CanvasRenderingContext2D, room: Room, index: number, s: Sim, t: number): void {
  const def = room.blocks[index]
  const b = s.blocks[index]
  if (b.state === 'broken') return
  if (def.kind === 'gate') {
    drawGate(ctx, room, def, b.state === 'open' ? ago(s.gateAt, t) / GATE_SINK : 0)
    return
  }
  // Only a gate opens.
  if (b.state === 'open') return
  begin(ctx)
  const u = ago(b.bumpedAt, t) / BUMP_FOR
  if (u < 1) ctx.translate(0, -Math.sin(Math.PI * u) * (def.kind === 'gift' ? GIFT_HOP : COOKIE_HOP))
  if (def.kind === 'gift') giftBox(ctx, ROOM_LOOK[room.id], def, b.state === 'empty', t)
  else cookie(ctx)
  ctx.restore()
}

/** A gift box in the room's accent: a ribbon cross, a bow on its front face, a shine bar and now and then a sparkle at a corner. Empty, it is plain brown paper. */
function giftBox(ctx: CanvasRenderingContext2D, look: RoomLook, def: BlockDef, empty: boolean, t: number) {
  const [base, shade] = empty ? EMPTY_BOX : [look.accent, look.accentShade]
  const [ribbon, ribbonShade] = empty ? EMPTY_RIBBON : [look.ribbon, look.ribbonShade]
  const box = (k: CanvasRenderingContext2D) => roundRectPath(k, 0.02, 0.02, 0.96, 0.96, 0.1)
  paperShadow(ctx, box)
  paintedPart(ctx, box, base, shade, SHADE_BLOCK, LINE, (lit) => {
    ctx.fillStyle = lit ? ribbon : ribbonShade
    ctx.fillRect(0.42, 0, 0.16, 1)
    ctx.fillRect(0, 0.42, 1, 0.16)
    ctx.beginPath()
    ctx.moveTo(0.42, 0)
    ctx.lineTo(0.42, 1)
    ctx.moveTo(0.58, 0)
    ctx.lineTo(0.58, 1)
    for (const y of [0.42, 0.58]) {
      ctx.moveTo(0, y)
      ctx.lineTo(0.42, y)
      ctx.moveTo(0.58, y)
      ctx.lineTo(1, y)
    }
    ctx.lineWidth = lw(LINE_DETAIL)
    ctx.strokeStyle = INK
    ctx.stroke()
  })
  if (empty) return
  ctx.save()
  ctx.globalAlpha *= 0.5
  roundRectPath(ctx, 0.12, 0.12, 0.08, 0.22, 0.04)
  ctx.fillStyle = '#FFFFFF'
  ctx.fill()
  ctx.restore()
  ctx.save()
  ctx.translate(0.5, 0.5)
  ctx.rotate(BOW_WIGGLE * Math.sin(Math.PI * t + def.col * 0.9))
  // The bow is small enough to go without a crescent: flat ribbon, ink, a dark hole in each loop.
  ctx.beginPath()
  for (const side of [-1, 1]) ellipseSub(ctx, side * 0.11, -0.035, 0.1, 0.07, -side * BOW_TILT)
  ctx.fillStyle = ribbon
  ctx.fill()
  ctx.lineWidth = lw(LINE_DETAIL)
  ctx.strokeStyle = INK
  ctx.stroke()
  ctx.beginPath()
  for (const side of [-1, 1]) ellipseSub(ctx, side * 0.13, -0.045, 0.04, 0.02, -side * BOW_TILT)
  ctx.fillStyle = ribbonShade
  ctx.fill()
  ctx.beginPath()
  ctx.arc(0, 0, 0.06, 0, Math.PI * 2)
  ctx.fillStyle = ribbon
  ctx.fill()
  ctx.stroke()
  ctx.restore()
  const wink = ((((t + hash(def.col, def.row) * SPARKLE_EVERY) % SPARKLE_EVERY) + SPARKLE_EVERY) % SPARKLE_EVERY) / SPARKLE_FOR
  if (wink < 1) {
    sparklePath(ctx, 0.83, 0.18, 0.34 * Math.sin(Math.PI * wink))
    ctx.fillStyle = COLOR.sparkle
    ctx.fill()
  }
}

/** A cookie block: a round-cornered cookie with three chocolate chips and a few crumbs. No mortar, no bricks. */
function cookie(ctx: CanvasRenderingContext2D) {
  const dough = (k: CanvasRenderingContext2D) => roundRectPath(k, 0.03, 0.03, 0.94, 0.94, 0.18)
  paperShadow(ctx, dough)
  inkPart(ctx, dough, COOKIE[0], COOKIE[1], SHADE_BLOCK, LINE, null)
  ctx.beginPath()
  for (const [x, y, r] of CHIPS) ellipseSub(ctx, x, y, r, r * 0.82, 0.4)
  ctx.fillStyle = CHIP
  ctx.fill()
  if (!detailed()) return
  ctx.beginPath()
  for (const [x, y, r] of CHIPS) ellipseSub(ctx, x - r * 0.35, y - r * 0.32, r * 0.32, r * 0.18, -0.5)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)'
  ctx.fill()
  ctx.beginPath()
  for (const [x, y] of CRUMBS) {
    ctx.moveTo(x + 0.025, y)
    ctx.arc(x, y, 0.025, 0, Math.PI * 2)
  }
  ctx.fillStyle = CRUMB
  ctx.fill()
}

/** One cell of the gate: three white pickets on a rail, pointed in the gate's top cell, sunk `u` of the way into the floor (0 standing, 1 gone). */
function drawGate(ctx: CanvasRenderingContext2D, room: Room, def: BlockDef, u: number) {
  if (u >= 1) return
  const isGate = (row: number) => {
    if (row < 0 || row >= ROWS) return false
    const i = room.blockAt[row * room.cols + def.col]
    return i >= 0 && room.blocks[i].kind === 'gate'
  }
  let top = def.row
  while (isGate(top - 1)) top--
  let foot = def.row
  while (isGate(foot + 1)) foot++
  const isTop = def.row === top
  const isFoot = def.row === foot
  begin(ctx)
  // Nothing shows below the floor it sinks into.
  ctx.beginPath()
  ctx.rect(-1, -ROWS, 3, foot + 1 - def.row + ROWS)
  ctx.clip()
  ctx.translate(0, (foot - top + 1) * u * u)
  // The pickets run on into the cells above and below, so their outline leaves those ends open.
  const pickets = (k: CanvasRenderingContext2D, outline: boolean) => {
    k.beginPath()
    const y0 = isTop ? 0.26 : -0.01
    const y1 = isFoot ? 1 : 1.01
    for (const x of PICKETS) {
      k.moveTo(x, y1)
      k.lineTo(x, y0)
      if (isTop) k.lineTo(x + PICKET_W / 2, 0.02)
      if (isTop || !outline) k.lineTo(x + PICKET_W, y0)
      else k.moveTo(x + PICKET_W, y0)
      k.lineTo(x + PICKET_W, y1)
      if (isFoot || !outline) k.lineTo(x, y1)
    }
  }
  paperShadow(ctx, (k) => pickets(k, false))
  if (isTop || isFoot || def.row === Math.floor((top + foot) / 2)) inkPart(ctx, (k) => roundRectPath(k, 0.03, 0.42, 0.94, 0.18, 0.04), RAIL[0], RAIL[1], 0.05, LINE, null)
  pickets(ctx, false)
  ctx.fillStyle = PICKET
  ctx.fill()
  pickets(ctx, true)
  ctx.lineWidth = lw(LINE)
  ctx.strokeStyle = INK
  ctx.stroke()
  ctx.restore()
}

/** A star from the map, origin at its centre. `phase` (from its x) ripples a row of stars; now and then a twinkle crosses it. Never spins, never has a face. */
export function drawStar(ctx: CanvasRenderingContext2D, t: number, phase: number): void {
  const k = 1 + 0.06 * Math.sin((t * 1.2 + phase) * Math.PI * 2)
  begin(ctx)
  ctx.scale(k, k)
  inkPart(ctx, (c) => starPath(c, 0, 0, STAR_R), COLOR.star, COLOR.starShade, SHADE_CHARACTER, LINE, null)
  shine(ctx, -0.1, -0.06, STAR_R * 0.25, STAR_R * 0.12, -0.6)
  const twinkle = (((t * 0.35 + phase * 0.37) % 1) + 1) % 1
  if (twinkle < 0.12) {
    sparklePath(ctx, 0.12, -0.1, 0.22 * Math.sin((Math.PI * twinkle) / 0.12))
    ctx.fillStyle = COLOR.sparkle
    ctx.fill()
  }
  ctx.restore()
}

/** A power-up, origin at its feet centre: the cupcake, the bubble wand, the rainbow ball. On a night room a soft moonlight sits behind it. */
export function drawItem(ctx: CanvasRenderingContext2D, it: Item, room: Room, t: number): void {
  begin(ctx)
  if (ROOM_LOOK[room.id].night) glow(ctx, 0, -0.38, 0.62, ITEM_GLOW[0], ITEM_GLOW[1])
  if (it.kind === 'cupcake') cupcake(ctx, it, t)
  else if (it.kind === 'wand') wand(ctx, it, t)
  else ball(ctx, it)
  ctx.restore()
}

/** The cupcake: a striped wrapper, three tiers of frosting with sprinkles, a cherry. It wobbles like jelly while it slides. No face. */
function cupcake(ctx: CanvasRenderingContext2D, it: Item, t: number) {
  if (it.grounded) groundShadow(ctx, it.w)
  if (it.grounded && Math.abs(it.vx) > 0.5) ctx.transform(1, 0, Math.tan(JELLY * Math.sin(t * JELLY_HZ * Math.PI * 2)), 1, 0, 0)
  const wrapper = (k: CanvasRenderingContext2D) => {
    k.beginPath()
    k.moveTo(-0.24, 0)
    k.lineTo(0.24, 0)
    k.lineTo(0.31, -0.33)
    k.lineTo(-0.31, -0.33)
    k.closePath()
  }
  paintedPart(ctx, wrapper, WRAPPER[1][0], WRAPPER[1][1], SHADE_CHARACTER, LINE, (lit) => {
    ctx.beginPath()
    for (const i of [0, 2, 4]) {
      ctx.moveTo(-0.24 + 0.096 * i, 0)
      ctx.lineTo(-0.24 + 0.096 * (i + 1), 0)
      ctx.lineTo(-0.31 + 0.124 * (i + 1), -0.33)
      ctx.lineTo(-0.31 + 0.124 * i, -0.33)
      ctx.closePath()
    }
    ctx.fillStyle = WRAPPER[0][lit ? 0 : 1]
    ctx.fill()
  })
  blob(ctx, FROSTING_BLOB, FROSTING[0], FROSTING[1], SHADE_CHARACTER, LINE, null)
  ctx.beginPath()
  ctx.moveTo(-0.24, -0.39)
  ctx.quadraticCurveTo(0, -0.31, 0.24, -0.39)
  ctx.moveTo(-0.15, -0.49)
  ctx.quadraticCurveTo(0, -0.43, 0.15, -0.49)
  ctx.lineWidth = lw(LINE_DETAIL)
  ctx.strokeStyle = INK
  ctx.stroke()
  for (const [x, y, a, c] of SPRINKLE_AT) {
    ctx.beginPath()
    ctx.moveTo(x - 0.035 * Math.cos(a), y - 0.035 * Math.sin(a))
    ctx.lineTo(x + 0.035 * Math.cos(a), y + 0.035 * Math.sin(a))
    ctx.lineWidth = lw(0.035)
    ctx.strokeStyle = SPRINKLES[c]
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.moveTo(0.01, -0.75)
  ctx.quadraticCurveTo(0.02, -0.85, 0.1, -0.89)
  inkLine(ctx, STEM, 0.03, LINE_DETAIL)
  inkPart(
    ctx,
    (k) => {
      k.beginPath()
      k.arc(0, -0.68, 0.085, 0, Math.PI * 2)
    },
    CHERRY[0],
    CHERRY[1],
    0.03,
    LINE,
    null,
  )
  shine(ctx, -0.03, -0.71, 0.03, 0.017, -0.6)
}

/** The bubble wand standing on its stick: the ring holds a film whose sheen turns, and a small bubble drifts off every WAND_PUFF seconds. */
function wand(ctx: CanvasRenderingContext2D, it: Item, t: number) {
  if (it.grounded) groundShadow(ctx, 0.4)
  inkPart(ctx, (k) => roundRectPath(k, -0.05, -0.4, 0.1, 0.4, 0.05), WAND_STICK[0], WAND_STICK[1], 0.03, LINE_DETAIL, null)
  ctx.save()
  ctx.translate(0, -WAND_Y)
  bubbleBall(ctx, WAND_HOLE, t)
  ctx.restore()
  const ring = (k: CanvasRenderingContext2D) => {
    k.beginPath()
    k.arc(0, -WAND_Y, WAND_RIM, 0, Math.PI * 2)
    k.moveTo(WAND_HOLE, -WAND_Y)
    k.arc(0, -WAND_Y, WAND_HOLE, 0, Math.PI * 2, true)
  }
  inkPart(ctx, ring, WAND_RING[0], WAND_RING[1], 0.03, LINE_DETAIL, null)
  ctx.beginPath()
  ctx.arc(0, -WAND_Y, WAND_RIM, 0, Math.PI * 2)
  ctx.lineWidth = lw(LINE)
  ctx.strokeStyle = INK
  ctx.stroke()
  const u = (((t % WAND_PUFF) + WAND_PUFF) % WAND_PUFF) / WAND_PUFF
  ctx.save()
  ctx.translate(0.17 + 0.22 * u + 0.03 * Math.sin(u * 9), -0.72 - 0.6 * u)
  ctx.globalAlpha *= u < 0.7 ? 1 : (1 - u) / 0.3
  bubbleBall(ctx, 0.045 + 0.035 * u, t)
  ctx.restore()
}

/** The rainbow ball: six bands turning as it rolls, an ink outline and a shine, squashing as it bounces. No face. */
function ball(ctx: CanvasRenderingContext2D, it: Item) {
  // Squashed right at a bounce: falling onto the floor at full speed or just sent back up.
  const q = it.grounded && it.vy >= 0 ? 1 : Math.min(1, Math.max(0, (Math.abs(it.vy) - (BALL_BOUNCE - 1.5)) / 1.5))
  const sy = 1 - (1 - BALL_SQUASH) * q
  ctx.scale(2 - sy, sy)
  const turn = (it.facing * it.x) / BALL_R
  const round = (k: CanvasRenderingContext2D) => {
    k.beginPath()
    k.arc(0, -BALL_R, BALL_R, 0, Math.PI * 2)
  }
  paintedPart(ctx, round, COLOR.rainbow[0], COLOR.rainbow[0], SHADE_CHARACTER, LINE, (lit) => {
    ctx.save()
    ctx.translate(0, -BALL_R)
    ctx.rotate(turn)
    const band = (BALL_R * 2) / COLOR.rainbow.length
    COLOR.rainbow.forEach((c, i) => {
      ctx.fillStyle = c
      ctx.fillRect(-BALL_R * 1.5, -BALL_R + i * band - (i === 0 ? 0.05 : 0), BALL_R * 3, band + 0.01 + (i === COLOR.rainbow.length - 1 ? 0.05 : 0))
    })
    ctx.restore()
    if (!lit) dim(ctx)
  })
  shine(ctx, -BALL_R * 0.4, -BALL_R * 1.45, BALL_R * 0.25, BALL_R * 0.12, -0.6)
}

/** A bubble Pia blew, origin at its feet (the bottom of the ball). */
export function drawBubble(ctx: CanvasRenderingContext2D, b: Bubble, t: number): void {
  ctx.save()
  ctx.translate(0, -b.w / 2)
  bubbleBall(ctx, b.w / 2, t)
  ctx.restore()
}

/** Each room's lift, `half` its width on each side of the origin (the middle of its top edge), 0.4 deep. */
const LIFT_ART: Record<RoomId, (ctx: CanvasRenderingContext2D, look: RoomLook, half: number, t: number) => void> = {
  // A big leaf, its stem curling at one end.
  garden: (ctx, look, half) => {
    ctx.beginPath()
    ctx.moveTo(-half + 0.05, 0.1)
    ctx.quadraticCurveTo(-half - 0.16, 0.1, -half - 0.22, -0.08)
    inkLine(ctx, look.liftMark, 0.05, LINE_DETAIL)
    const leaf = (k: CanvasRenderingContext2D) => {
      k.beginPath()
      k.moveTo(-half, 0.1)
      k.bezierCurveTo(-half * 0.6, -0.03, half * 0.6, -0.03, half, 0.1)
      k.bezierCurveTo(half * 0.6, 0.52, -half * 0.6, 0.52, -half, 0.1)
      k.closePath()
    }
    paintedPart(ctx, leaf, look.lift, look.liftShade, SHADE_CHARACTER, LINE, (lit) => {
      ctx.beginPath()
      ctx.moveTo(-half + 0.15, 0.12)
      ctx.quadraticCurveTo(0, 0.24, half - 0.15, 0.12)
      for (let x = -half + 0.55; x < half - 0.4; x += 0.5) {
        const y = 0.12 + 0.12 * (1 - (x / half) ** 2)
        ctx.moveTo(x, y)
        ctx.lineTo(x + 0.22, y - 0.1)
        ctx.moveTo(x, y)
        ctx.lineTo(x + 0.22, y + 0.1)
      }
      ctx.lineWidth = lw(0.035)
      ctx.strokeStyle = look.liftMark
      ctx.stroke()
      if (!lit) dim(ctx)
    })
  },
  // A tray with a rim and a handle slot at each end.
  kitchen: (ctx, look, half) => {
    const tray = (k: CanvasRenderingContext2D) => {
      k.beginPath()
      cornerRectPath(k, -half, 0, half * 2, 0.36, 0.06, 0.06, 0.14, 0.14)
    }
    paintedPart(ctx, tray, look.lift, look.liftShade, SHADE_CHARACTER, LINE, (lit) => {
      ctx.fillStyle = look.liftMark
      ctx.fillRect(-half - 0.1, -0.1, half * 2 + 0.2, 0.19)
      ctx.beginPath()
      for (const side of [-1, 1]) ellipseSub(ctx, side * (half - 0.3), 0.22, 0.13, 0.045, 0)
      ctx.fillStyle = look.liftMark
      ctx.fill()
      ctx.lineWidth = lw(LINE_DETAIL)
      ctx.strokeStyle = INK
      ctx.stroke()
      if (!lit) dim(ctx)
    })
  },
  // A sponge full of holes, bobbing a little.
  bath: (ctx, look, half, t) => {
    ctx.translate(0, 0.02 * Math.sin(t * 2.2))
    paintedPart(ctx, (k) => roundRectPath(k, -half, 0, half * 2, 0.4, 0.12), look.lift, look.liftShade, SHADE_CHARACTER, LINE, (lit) => {
      ctx.beginPath()
      const n = Math.round(half * 8)
      for (let i = 0; i < n; i++) {
        const r = 0.035 + 0.03 * hash(i, 73)
        ellipseSub(ctx, -half + 0.12 + (half * 2 - 0.24) * ((i + hash(i, 71)) / n), 0.08 + 0.22 * hash(i, 72), r, r * 0.8, 0)
      }
      ctx.fillStyle = look.liftMark
      ctx.fill()
      if (!lit) dim(ctx)
    })
  },
  // A toy wagon on two ink wheels, its pull handle up at the front.
  toys: (ctx, look, half) => {
    ctx.beginPath()
    ctx.moveTo(half - 0.05, 0.16)
    ctx.lineTo(half + 0.28, -0.04)
    inkLine(ctx, look.liftShade, 0.06, LINE_DETAIL)
    ctx.beginPath()
    for (const x of [-half + 0.42, half - 0.42]) {
      ctx.moveTo(x + 0.14, 0.38)
      ctx.arc(x, 0.38, 0.14, 0, Math.PI * 2)
    }
    ctx.fillStyle = look.liftMark
    ctx.fill()
    ctx.beginPath()
    for (const x of [-half + 0.42, half - 0.42]) {
      ctx.moveTo(x + 0.045, 0.38)
      ctx.arc(x, 0.38, 0.045, 0, Math.PI * 2)
    }
    ctx.fillStyle = '#FFFFFF'
    ctx.fill()
    paintedPart(ctx, (k) => roundRectPath(k, -half, 0, half * 2, 0.32, 0.08), look.lift, look.liftShade, SHADE_CHARACTER, LINE, (lit) => {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)'
      ctx.fillRect(-half - 0.1, 0.05, half * 2 + 0.2, 0.06)
      if (!lit) dim(ctx)
    })
  },
  // A cloud, inked and faceless, flat enough on top to stand on.
  roof: (ctx, look, half) => {
    const n = Math.max(2, Math.round((half * 2 - 0.4) / 0.32) + 1)
    const xyr: number[] = []
    for (let i = 0; i < n; i++) xyr.push(-half + 0.21 + ((half * 2 - 0.42) * i) / (n - 1), 0.21, 0.21)
    for (let i = 0; i < n - 1; i++) xyr.push(-half + 0.21 + ((half * 2 - 0.42) * (i + 0.5)) / (n - 1), 0.3, 0.17)
    blob(ctx, xyr, look.lift, look.liftShade, SHADE_CHARACTER, LINE, null)
  },
}

/** A lift, origin at the middle of its top edge, in the room's look. A loop lift that moves up and down hangs from strings that run to the top of the screen. */
export function drawLift(ctx: CanvasRenderingContext2D, room: Room, def: LiftDef, t: number): void {
  begin(ctx)
  if (def.kind === 'loop' && def.dy !== 0) {
    // The screen's top, in tiles above the origin.
    const m = ctx.getTransform()
    const top = -m.f / m.d - 0.5
    ctx.beginPath()
    for (const x of def.width >= 2 ? [-def.width / 2 + 0.35, def.width / 2 - 0.35] : [0]) {
      ctx.moveTo(x, 0.1)
      ctx.lineTo(x, top)
    }
    ctx.lineWidth = lw(LINE_DETAIL)
    ctx.strokeStyle = INK
    ctx.stroke()
  }
  LIFT_ART[room.id](ctx, ROOM_LOOK[room.id], def.width / 2, t)
  ctx.restore()
}

/** How tall the spring's coil is, as a share of its rest height, `after` seconds after it launched her. */
function springHeight(after: number) {
  if (after < SPRING_HOLD) return SPRING_SQUASH
  const u = (after - SPRING_HOLD) / SPRING_WOBBLE
  if (u >= 1) return 1
  return 1 - (1 - SPRING_SQUASH) * (1 - u) ** 2 * Math.cos(u * Math.PI * 6)
}

/** A spring, origin at its feet centre: a base plate, a coil of five zigzags and a pad in the accent, squashing and wobbling after `usedAt` (a tick). */
export function drawSpring(ctx: CanvasRenderingContext2D, room: Room, usedAt: number, t: number): void {
  const look = ROOM_LOOK[room.id]
  const h = COIL_H * springHeight(ago(usedAt, t))
  begin(ctx)
  groundShadow(ctx, 0.8)
  inkPart(ctx, (k) => roundRectPath(k, -0.3, -0.08, 0.6, 0.08, 0.03), COIL[0], COIL[1], 0.03, LINE, null)
  const y0 = -0.07
  for (const front of [false, true]) {
    ctx.beginPath()
    for (let i = 0; i < COIL_LOOPS; i++) {
      const y = y0 - (h * (i + 0.5)) / COIL_LOOPS
      ctx.moveTo(front ? 0.27 : -0.27, y)
      ctx.ellipse(0, y, 0.27, 0.05, front ? 0.1 : -0.1, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2)
    }
    inkLine(ctx, COIL[front ? 0 : 1], 0.05, LINE_DETAIL)
  }
  inkPart(ctx, (k) => roundRectPath(k, -0.4, y0 - h - 0.17, 0.8, 0.18, 0.07), look.accent, look.accentShade, 0.06, LINE, null)
  ctx.restore()
}

/** The ribbon pole, origin at its foot, with the bow on top; the band her grab paid (s.poleBonus) lights up. */
export function drawPole(ctx: CanvasRenderingContext2D, room: Room, s: Sim, t: number): void {
  const look = ROOM_LOOK[room.id]
  begin(ctx)
  // Five faint bands up the pole, worth 1 at the foot to POLE_STARS at the bow.
  const band = POLE_HEIGHT / POLE_STARS
  for (let i = 1; i <= POLE_STARS; i++) {
    const lit = s.poleBonus === i
    ctx.save()
    ctx.globalAlpha *= lit ? 0.8 + 0.2 * Math.sin(t * 6) : look.night ? 0.16 : 0.35
    roundRectPath(ctx, lit ? -0.36 : -0.21, -i * band + 0.1, lit ? 0.72 : 0.42, band - 0.2, 0.21)
    ctx.fillStyle = lit ? COLOR.star : COLOR.starShine
    ctx.fill()
    ctx.restore()
  }
  paintedPart(
    ctx,
    (k) => {
      k.beginPath()
      k.rect(-POLE_W / 2, -POLE_HEIGHT, POLE_W, POLE_HEIGHT)
    },
    '#FFFFFF',
    '#FFFFFF',
    0,
    LINE,
    () => {
      ctx.beginPath()
      for (let y = -POLE_HEIGHT; y < 0.5; y += POLE_STRIPE) {
        ctx.moveTo(-0.2, y + 0.22)
        ctx.lineTo(0.2, y - 0.02)
        ctx.lineTo(0.2, y + 0.14)
        ctx.lineTo(-0.2, y + 0.38)
        ctx.closePath()
      }
      ctx.fillStyle = look.accent
      ctx.fill()
    },
  )
  if (s.poleBonus > 0) {
    const y = -(s.poleBonus - 0.5) * band
    for (let i = 0; i < 4; i++) {
      const a = t * 1.5 + (i * Math.PI) / 2
      const size = 0.16 + 0.1 * Math.sin(t * 5 + i * 1.9)
      sparklePath(ctx, Math.cos(a) * 0.55, y + Math.sin(a) * band * 0.4, size)
      ctx.fillStyle = i % 2 === 0 ? COLOR.sparkle : COLOR.sparkleWarm
      ctx.fill()
    }
  }
  inkPart(
    ctx,
    (k) => {
      k.beginPath()
      k.ellipse(0, 0, 0.38, 0.28, 0, Math.PI, Math.PI * 2)
      k.closePath()
    },
    look.accent,
    look.accentShade,
    0.07,
    LINE,
    null,
  )
  ctx.translate(0, -POLE_HEIGHT - 0.04)
  // Two streamers waving off to the side at 1 Hz.
  for (const [i, lit, shade] of [
    [1, look.ribbon, look.ribbonShade],
    [0, look.accent, look.accentShade],
  ] as const) {
    const at = (u: number) => [0.05 + STREAMER * u * 0.96, 0.12 + i * 0.16 + 0.55 * u + 0.2 * u * Math.sin(Math.PI * 2 * (t - u * 1.1) + i * 1.4)] as const
    inkPart(
      ctx,
      (k) => {
        k.beginPath()
        for (let j = 0; j <= 16; j++) {
          const [x, y] = at(j / 16)
          k.lineTo(x, y - 0.06)
        }
        const [ex, ey] = at(1)
        k.lineTo(ex - 0.05, ey)
        for (let j = 16; j >= 0; j--) {
          const [x, y] = at(j / 16)
          k.lineTo(x, y + 0.06)
        }
        k.closePath()
      },
      lit,
      shade,
      0.03,
      LINE,
      null,
    )
  }
  // The bow: two tails, two loops and the knot.
  for (const side of [-1, 1]) {
    inkPart(
      ctx,
      (k) => {
        k.beginPath()
        k.moveTo(side * 0.04, 0)
        k.lineTo(side * 0.36, 0.72)
        k.lineTo(side * 0.24, 0.66)
        k.lineTo(side * 0.17, 0.8)
        k.lineTo(-side * 0.08, 0.06)
        k.closePath()
      },
      look.accent,
      look.accentShade,
      0.04,
      LINE,
      null,
    )
  }
  for (const side of [-1, 1]) {
    inkPart(
      ctx,
      (k) => {
        k.beginPath()
        ellipseSub(k, side * 0.3, -0.08, 0.275, 0.19, -side * 0.35)
      },
      look.accent,
      look.accentShade,
      0.05,
      LINE,
      null,
    )
    ctx.beginPath()
    ellipseSub(ctx, side * 0.34, -0.1, 0.11, 0.06, -side * 0.35)
    ctx.fillStyle = look.accentShade
    ctx.fill()
  }
  inkPart(
    ctx,
    (k) => {
      k.beginPath()
      k.arc(0, 0, 0.12, 0, Math.PI * 2)
    },
    look.accent,
    look.accentShade,
    0.04,
    LINE,
    null,
  )
  ctx.restore()
}

/** The kitten's felt dome bed, origin at its foot centre: a felt dome on a puffy base cushion, a round dark doorway with a rolled rim (its floor is the bed's foot), a heart sewn on above it, a pom-pom on top. `open` from 0 to 1 is how far the kitten has come out; the dome gives a little squash on the way. The kitten itself is drawn by drawKitten. */
export function drawBed(ctx: CanvasRenderingContext2D, room: Room, open: number, t: number): void {
  const look = ROOM_LOOK[room.id]
  begin(ctx)
  if (look.night) glow(ctx, 0, -1.05, 2.1 * (1 + 0.03 * Math.sin(t * 1.4)), BED_GLOW[0], BED_GLOW[1])
  groundShadow(ctx, BED_W)
  const squash = open > 0.1 && open < 0.3 ? Math.sin((Math.PI * (open - 0.1)) / 0.2) : 0
  ctx.scale(1 + 0.05 * squash, 1 - 0.07 * squash)
  const half = BED_W / 2
  inkPart(
    ctx,
    (k) => {
      k.beginPath()
      k.moveTo(-half * 0.96, -BED_BAND * 0.6)
      k.bezierCurveTo(-half - 0.02, -BED_H * 0.62, -half * 0.62, -BED_H, 0, -BED_H)
      k.bezierCurveTo(half * 0.62, -BED_H, half + 0.02, -BED_H * 0.62, half * 0.96, -BED_BAND * 0.6)
      k.closePath()
    },
    look.bed,
    look.bedShade,
    SHADE_BLOCK,
    LINE,
    null,
  )
  inkPart(ctx, (k) => roundRectPath(k, -half - 0.08, -BED_BAND, BED_W + 0.16, BED_BAND, BED_BAND / 2), look.bedShade, look.bedShade, 0, LINE, null)
  // A heart sewn on above the doorway, its stitches round it.
  heartPath(ctx, 0, -BED_H * 0.7, 0.46)
  ctx.fillStyle = look.accent
  ctx.fill()
  ctx.lineWidth = lw(LINE_DETAIL)
  ctx.strokeStyle = INK
  ctx.stroke()
  ctx.save()
  ctx.setLineDash([0.05, 0.06])
  heartPath(ctx, 0, -BED_H * 0.7, 0.62)
  ctx.lineWidth = lw(0.025)
  ctx.strokeStyle = look.bedShade
  ctx.stroke()
  ctx.restore()
  const door = DOOR_W / 2
  const arch = (k: CanvasRenderingContext2D, grow: number) => {
    k.beginPath()
    k.moveTo(-door - grow, 0)
    k.lineTo(-door - grow, -DOOR_H + door)
    k.arc(0, -DOOR_H + door, door + grow, Math.PI, Math.PI * 2)
    k.lineTo(door + grow, 0)
    k.closePath()
  }
  // The doorway's rolled felt rim, then the dark doorway.
  inkPart(ctx, (k) => arch(k, DOOR_RIM), look.bedShade, look.bedShade, 0, LINE, null)
  inkPart(ctx, (k) => arch(k, 0), DOORWAY, DOORWAY, 0, LINE_DETAIL, null)
  // The pom-pom sways a little on top.
  ctx.translate(0, -BED_H + 0.04)
  ctx.rotate(0.12 * Math.sin(t * 1.6))
  blob(ctx, [0, -0.12, 0.13, -0.09, -0.06, 0.1, 0.09, -0.06, 0.1, 0, -0.2, 0.1], POM[0], POM[1], 0.04, LINE, null)
  ctx.restore()
}

/** The picnic after the last kitten, origin at the blanket's middle on the floor: a checked blanket, a cake with candles, two paper lanterns glowing on a string. No faces. */
export function drawPicnic(ctx: CanvasRenderingContext2D, t: number): void {
  const look = ROOM_LOOK.roof
  begin(ctx)
  // The lanterns' posts and string, behind everything.
  for (const x of [-3.3, 3.3]) inkPart(ctx, (k) => roundRectPath(k, x - 0.06, -3.15, 0.12, 3.15, 0.05), POST[0], POST[1], 0.03, LINE, null)
  ctx.beginPath()
  ctx.moveTo(-3.3, -3)
  ctx.quadraticCurveTo(0, -2.2, 3.3, -3)
  ctx.lineWidth = lw(LINE_DETAIL)
  ctx.strokeStyle = INK
  ctx.stroke()
  LANTERNS.forEach(([lit, shade], i) => {
    const x = i === 0 ? -1.5 : 1.5
    const u = (x + 3.3) / 6.6
    const y = -3 * (1 - u) ** 2 - 2 * 2.2 * u * (1 - u) - 3 * u ** 2
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(0.07 * Math.sin(t * 1.3 + i * 2))
    glow(ctx, 0, 0.45, 0.95 * (1 + 0.04 * Math.sin(t * 3 + i)), LANTERN_GLOW[0], LANTERN_GLOW[1])
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(0, 0.12)
    ctx.lineWidth = lw(LINE_DETAIL)
    ctx.strokeStyle = INK
    ctx.stroke()
    paintedPart(
      ctx,
      (k) => {
        k.beginPath()
        ellipseSub(k, 0, 0.45, 0.36, 0.3, 0)
      },
      lit,
      shade,
      0.05,
      LINE,
      () => {
        ctx.beginPath()
        for (const rx of [0.13, 0.27]) {
          ellipseSub(ctx, 0, 0.45, rx, 0.3, 0)
        }
        ctx.lineWidth = lw(LINE_DETAIL)
        ctx.strokeStyle = shade
        ctx.stroke()
      },
    )
    for (const cy of [0.13, 0.77]) inkPart(ctx, (k) => roundRectPath(k, -0.13, cy - 0.04, 0.26, 0.08, 0.03), LANTERN_CAP, LANTERN_CAP, 0, LINE_DETAIL, null)
    ctx.restore()
  })
  // The blanket, seen a little from above, checked in the accent and white.
  const blanket = (k: CanvasRenderingContext2D) => {
    k.beginPath()
    k.moveTo(-3, 0)
    k.lineTo(3, 0)
    k.lineTo(2.55, -0.5)
    k.lineTo(-2.55, -0.5)
    k.closePath()
  }
  const corner = (i: number, j: number) => {
    const y = -0.5 * (1 - j / 2)
    const half = 2.55 + 0.45 * (j / 2)
    return [-half + (2 * half * i) / 10, y] as const
  }
  paintedPart(ctx, blanket, '#FFFFFF', '#E6DFEF', 0.06, LINE, () => {
    ctx.beginPath()
    for (let j = 0; j < 2; j++) {
      for (let i = j % 2; i < 10; i += 2) {
        ctx.moveTo(...corner(i, j))
        ctx.lineTo(...corner(i + 1, j))
        ctx.lineTo(...corner(i + 1, j + 1))
        ctx.lineTo(...corner(i, j + 1))
        ctx.closePath()
      }
    }
    ctx.fillStyle = look.accent
    ctx.fill()
  })
  // The cake on a plate, three candles flickering.
  inkPart(
    ctx,
    (k) => {
      k.beginPath()
      ellipseSub(k, 0, -0.24, 0.72, 0.11, 0)
    },
    '#FFFFFF',
    '#E6DFEF',
    0.03,
    LINE,
    null,
  )
  paintedPart(
    ctx,
    (k) => {
      k.beginPath()
      k.moveTo(-0.55, -0.88)
      k.lineTo(-0.55, -0.32)
      k.ellipse(0, -0.32, 0.55, 0.1, 0, Math.PI, 0, true)
      k.lineTo(0.55, -0.88)
      k.closePath()
    },
    CAKE[0],
    CAKE[1],
    0.07,
    LINE,
    (lit) => {
      ctx.beginPath()
      ctx.moveTo(-0.6, -1)
      ctx.lineTo(0.6, -1)
      ctx.lineTo(0.6, -0.8)
      for (let i = 4; i >= 0; i--) ctx.ellipse(-0.55 + 0.11 + i * 0.22, -0.8, 0.11, 0.06 + 0.05 * hash(i, 5), 0, 0, Math.PI)
      ctx.lineTo(-0.6, -0.8)
      ctx.closePath()
      ctx.fillStyle = ICING[lit ? 0 : 1]
      ctx.fill()
    },
  )
  inkPart(
    ctx,
    (k) => {
      k.beginPath()
      ellipseSub(k, 0, -0.88, 0.55, 0.1, 0)
    },
    ICING[0],
    ICING[1],
    0.02,
    LINE,
    null,
  )
  CANDLES.forEach((c, i) => {
    const x = -0.25 + i * 0.25
    inkPart(ctx, (k) => roundRectPath(k, x - 0.035, -1.22, 0.07, 0.34, 0.02), c, c, 0, LINE_DETAIL, null)
    const f = 1 + 0.15 * Math.sin(t * 12 + i * 2.3)
    ctx.beginPath()
    ellipseSub(ctx, x, -1.3, 0.055 * f, 0.1 * f, 0)
    ctx.fillStyle = FLAME[1]
    ctx.fill()
    ctx.beginPath()
    ellipseSub(ctx, x, -1.29, 0.03 * f, 0.06 * f, 0)
    ctx.fillStyle = FLAME[0]
    ctx.fill()
  })
  ctx.restore()
}
