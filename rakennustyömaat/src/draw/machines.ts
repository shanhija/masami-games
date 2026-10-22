import { RECIPES } from '../game/catalog'
import { DEPTH, rect } from '../game/layout'
import { MACHINES, type MachineId, type MachineStage, type Material, type Raw } from '../game/model'
import { BLOCK, BLOCK_DEPTH, drawGood } from './goods'
import {
  BOX,
  C,
  INK,
  MACHINE_LOOK,
  MATERIAL_LOOK,
  RAW_LOOK,
  TAU,
  arch,
  blob,
  box,
  circlePath,
  clamp01,
  detail,
  groundShadow,
  heldAge,
  ink,
  loop,
  lw,
  mix,
  part,
  phaseOf,
  puff,
  roundRectPath,
  shine,
  smooth,
  sparkle,
  squash,
  tube,
  type Faces,
  type SheetEntry,
} from './look'

/**
 * The yard's machines on a shared kit (hazard plinth on four chunky feet, steel hopper
 * top-left with the input's picture on a band, slanted output chute bottom-right, a round
 * gauge whose needle sweeps through each batch, rivets, a ready lamp, a sign plate with the
 * input, an arrow and the output, a lever for the builder; no words, no face), each in its
 * own body colour with one big moving part on its top: the sawmill's blade, the brick oven's
 * round brick dome with its fire mouth and puffing chimney, the cement mixer's striped drum
 * that glugs and slides pale slabs down the chute, the glass oven's dome whose bubbles pop
 * into panes, the rainbow machine's wheel throwing a rainbow into its chute. Also the empty
 * pad (a hazard slab, a faint blueprint ghost of its machine and a bubble with the good it
 * waits for), the crate and its opening like a flower, the raw heaps and the made stacks.
 *
 * Everything is a made thing: a box with a lit top and a dark right face receding by
 * layout's DEPTH, inked at the edge weight round the body and the line weight for the kit's
 * parts. The front keeps one round thing (the gauge) and the lamp sits on top, so no two
 * circles ever pair up into a face.
 */

/** A machine's moment, in seconds since each stamp (Infinity for never): the batch running, the last push, the last cough, the crate's hits, when it unfolded. */
export interface MachinePic {
  stage: MachineStage
  on: boolean
  batchAge: number
  batchFor: number
  pushAge: number
  coughAge: number
  hits: number
  hitAge: number
  builtAge: number
  /** It has raw goods waiting: the ready lamp is green and it hops a little now and then. */
  ready: boolean
}

/** The kit's own colours beyond look.ts: the sign plate, the gauge, sawdust, fire, smoke, the cough, the drum, bubbles. */
const KIT = {
  plate: '#FFF4DC',
  gauge: '#FFFFFF',
  needle: '#E8443A',
  lampOff: '#C9CFDA',
  lampOn: '#4FD36A',
  knob: '#E8443A',
  sawdust: '#F6CB8E',
  sawdustDark: '#E8A85C',
  fire: '#FF9F3A',
  fireHot: '#FFD93A',
  ember: '#FF7A1F',
  mouth: '#3F2A2A',
  smoke: '#F2F0EA',
  cough: '#BAC4D6',
  drum: '#F5F1E6',
  bubble: 'rgba(255, 255, 255, 0.85)',
  crateLabel: '#FFF4DC',
} as const

// The kit's measures, origin at the bottom centre of layout.machineRect (2.4 x 2.6).
const D = DEPTH
const PLINTH = { x: -0.98, y: -0.4, w: 1.6, h: 0.26 }
const BODY = { x: -0.85, y: -1.9, w: 1.35, h: 1.5 }
/** The moving part's centre: on the top face's middle line, right of the hopper. */
const TOPX = 0.06
const TOPY = BODY.y - D / 2
const GAUGE = { x: 0.2, y: -1.56, r: 0.16 }
const PLATE = { x: -0.72, y: -1.14, w: 1.02, h: 0.54 }
const LEVER = { x: BODY.x, y: -1.2 }
/** The chute: from its top end at the body to its lip, and how far its top face recedes. */
const CHUTE = { x0: BODY.x + BODY.w - 0.05, y0: -1.0, x1: 1.12, y1: -0.62, lip: 0.12 }
/** The crate on its pad: its front face. */
const CRATE = { x: -0.82, y: -1.3, w: 1.4, h: 1.3 }
/** The crate unfolds over UNFOLD: its walls fall open like petals by FALL, the machine rises from RISE_FROM to RISE_TO, the walls shrink away after. */
const UNFOLD = 1.0
const FALL = 0.32
const RISE_FROM = 0.1
const RISE_TO = 0.48

/** How far through its batch a machine is, 0 to 1 (0 when it is not running). */
const progress = (p: MachinePic) => (p.on && p.batchFor > 0 ? clamp01(heldAge(p.batchAge) / p.batchFor) : 0)

/** The hazard stripes over the rect (x, y, w, h): diagonal ink bands, clipped to it. */
function hazard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  ctx.beginPath()
  const step = 0.18
  for (let sx = x - h; sx < x + w; sx += step) {
    ctx.moveTo(sx, y + h)
    ctx.lineTo(sx + h, y)
    ctx.lineTo(sx + h + step / 2, y)
    ctx.lineTo(sx + step / 2, y + h)
    ctx.closePath()
  }
  ctx.fillStyle = INK
  ctx.fill()
  ctx.restore()
}

/** The plinth on its four feet: the far two peek out behind, the near two stand in front. */
function drawPlinth(ctx: CanvasRenderingContext2D) {
  const foot = (x: number, y: number) => box(ctx, x, y - 0.14, 0.2, 0.14, BOX.asphalt, 0.06, true, true, 'line')
  foot(PLINTH.x + 0.3 + D, -D)
  foot(PLINTH.x + PLINTH.w - 0.26 + D * 0.6, -D * 0.6)
  box(ctx, PLINTH.x, PLINTH.y, PLINTH.w, PLINTH.h, BOX.yellow, D, true, true, 'edge')
  hazard(ctx, PLINTH.x, PLINTH.y, PLINTH.w, PLINTH.h)
  ctx.beginPath()
  ctx.rect(PLINTH.x, PLINTH.y, PLINTH.w, PLINTH.h)
  ink(ctx, 'edge')
  foot(PLINTH.x + 0.06, 0)
  foot(PLINTH.x + PLINTH.w - 0.3, 0)
}

/** The steel hopper on the top-left with the input's picture on its band. */
function drawHopper(ctx: CanvasRenderingContext2D, raw: Raw, t: number) {
  const tl = [-1.02, -2.38] as const
  const tr = [-0.34, -2.38] as const
  const br = [-0.5, -1.96] as const
  const bl = [-0.86, -1.96] as const
  const r = 0.16
  // The right face, the open top (dark inside), then the front.
  ctx.beginPath()
  ctx.moveTo(tr[0], tr[1])
  ctx.lineTo(tr[0] + r, tr[1] - r)
  ctx.lineTo(br[0] + r, br[1] - r)
  ctx.lineTo(br[0], br[1])
  ctx.closePath()
  part(ctx, BOX.steel.side, 'line')
  ctx.beginPath()
  ctx.moveTo(tl[0], tl[1])
  ctx.lineTo(tl[0] + r, tl[1] - r)
  ctx.lineTo(tr[0] + r, tr[1] - r)
  ctx.lineTo(tr[0], tr[1])
  ctx.closePath()
  part(ctx, BOX.asphalt.side, 'line')
  ctx.beginPath()
  ctx.moveTo(tl[0], tl[1])
  ctx.lineTo(tr[0], tr[1])
  ctx.lineTo(br[0], br[1])
  ctx.lineTo(bl[0], bl[1])
  ctx.closePath()
  part(ctx, BOX.steel.face, 'line')
  // The band and the picture.
  ctx.save()
  ctx.clip()
  ctx.beginPath()
  ctx.rect(-1.1, -2.32, 0.9, 0.28)
  part(ctx, KIT.plate, 'detail')
  ctx.restore()
  ctx.save()
  ctx.translate(-0.69, -2.065)
  ctx.scale(0.44, 0.44)
  drawGood(ctx, raw, t)
  ctx.restore()
}

/** The slanted chute out of the bottom right, where the made goods slide out. */
function drawChute(ctx: CanvasRenderingContext2D) {
  const { x0, y0, x1, y1, lip } = CHUTE
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  ctx.lineTo(x1 + lip, y1 - lip)
  ctx.lineTo(x0 + lip, y0 - lip)
  ctx.closePath()
  part(ctx, BOX.steel.top, 'line')
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  ctx.lineTo(x1, y1 + 0.13)
  ctx.lineTo(x0, y0 + 0.16)
  ctx.closePath()
  part(ctx, BOX.steel.face, 'line')
}

/** The gauge: a white dial whose needle sweeps from left to right through each batch. */
function drawGauge(ctx: CanvasRenderingContext2D, p: MachinePic, fine: boolean) {
  const g = GAUGE
  circlePath(ctx, g.x, g.y, g.r)
  part(ctx, BOX.steel.top, 'line')
  circlePath(ctx, g.x, g.y, g.r * 0.74)
  part(ctx, KIT.gauge, 'detail')
  if (fine) {
    ctx.beginPath()
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * (1.1 + (0.8 * i) / 4)
      ctx.moveTo(g.x + Math.cos(a) * g.r * 0.6, g.y + Math.sin(a) * g.r * 0.6)
      ctx.lineTo(g.x + Math.cos(a) * g.r * 0.72, g.y + Math.sin(a) * g.r * 0.72)
    }
    ink(ctx, 'detail')
  }
  const a = Math.PI * (1.1 + 0.8 * smooth(0, 1, progress(p)))
  ctx.beginPath()
  ctx.moveTo(g.x, g.y)
  ctx.lineTo(g.x + Math.cos(a) * g.r * 0.62, g.y + Math.sin(a) * g.r * 0.62)
  ctx.lineCap = 'round'
  ctx.lineWidth = Math.max(lw('line'), 0.03)
  ctx.strokeStyle = KIT.needle
  ctx.stroke()
  circlePath(ctx, g.x, g.y, 0.028)
  part(ctx, KIT.needle, 'detail')
}

/** The sign plate on the front: the input, a fat arrow, the output. No words. */
function drawPlate(ctx: CanvasRenderingContext2D, raw: Raw, made: Material, t: number, fine: boolean) {
  const p = PLATE
  roundRectPath(ctx, p.x, p.y, p.w, p.h, 0.05)
  part(ctx, KIT.plate, 'line')
  if (fine) {
    for (const [rx, ry] of [
      [p.x + 0.05, p.y + 0.05],
      [p.x + p.w - 0.05, p.y + 0.05],
      [p.x + 0.05, p.y + p.h - 0.05],
      [p.x + p.w - 0.05, p.y + p.h - 0.05],
    ] as const) {
      circlePath(ctx, rx, ry, 0.016)
      part(ctx, BOX.steel.top, 'detail')
    }
  }
  const base = p.y + p.h - 0.07
  for (const [good, x] of [
    [raw, p.x + 0.22],
    [made, p.x + p.w - 0.23],
  ] as const) {
    ctx.save()
    ctx.translate(x, base)
    ctx.scale(0.66, 0.66)
    drawGood(ctx, good, t)
    ctx.restore()
  }
  const ax = p.x + p.w / 2 - 0.02
  const ay = p.y + p.h / 2 + 0.02
  ctx.beginPath()
  ctx.moveTo(ax - 0.09, ay - 0.035)
  ctx.lineTo(ax + 0.02, ay - 0.035)
  ctx.lineTo(ax + 0.02, ay - 0.08)
  ctx.lineTo(ax + 0.11, ay)
  ctx.lineTo(ax + 0.02, ay + 0.08)
  ctx.lineTo(ax + 0.02, ay + 0.035)
  ctx.lineTo(ax - 0.09, ay + 0.035)
  ctx.closePath()
  ctx.fillStyle = INK
  ctx.fill()
}

/** The ready lamp on the top's back right corner: green with a shine and a soft glow that breathes when goods wait, grey when not. */
function drawLamp(ctx: CanvasRenderingContext2D, ready: boolean, t: number) {
  const x = BODY.x + BODY.w + D * 0.55
  const y = BODY.y - D * 0.55
  if (ready) {
    circlePath(ctx, x, y - 0.05, 0.15 + 0.03 * Math.sin((TAU * t) / 1.6))
    ctx.fillStyle = C.light
    ctx.fill()
  }
  ctx.beginPath()
  ctx.rect(x - 0.06, y - 0.04, 0.12, 0.05)
  part(ctx, BOX.steel.side, 'line')
  ctx.beginPath()
  ctx.arc(x, y - 0.04, 0.08, Math.PI, TAU)
  ctx.closePath()
  part(ctx, ready ? KIT.lampOn : KIT.lampOff, 'line')
  if (ready) shine(ctx, x, y - 0.04, 0.08)
}

/** The lever on the left side, where the builder stands; a push pulls it down for a moment. */
function drawLever(ctx: CanvasRenderingContext2D, pushAge: number) {
  const pull = pushAge < 0.5 ? arch(clamp01(pushAge / 0.5)) : 0
  const a = -0.75 + 1.1 * pull
  const len = 0.36
  const kx = LEVER.x - Math.cos(a) * len
  const ky = LEVER.y + Math.sin(a) * len
  ctx.beginPath()
  ctx.moveTo(LEVER.x, LEVER.y)
  ctx.lineTo(kx, ky)
  ctx.lineCap = 'round'
  tube(ctx, 0.045, BOX.steel.top)
  circlePath(ctx, kx, ky, 0.075)
  part(ctx, KIT.knob, 'line')
  shine(ctx, kx, ky, 0.075)
  ctx.beginPath()
  ctx.rect(LEVER.x - 0.03, LEVER.y - 0.07, 0.06, 0.14)
  part(ctx, BOX.steel.side, 'line')
}

/** The rivets at the body's front corners. */
function drawRivets(ctx: CanvasRenderingContext2D, faces: Faces) {
  for (const [x, y] of [
    [BODY.x + 0.07, BODY.y + 0.07],
    [BODY.x + BODY.w - 0.07, BODY.y + 0.07],
    [BODY.x + 0.07, BODY.y + BODY.h - 0.07],
    [BODY.x + BODY.w - 0.07, BODY.y + BODY.h - 0.07],
  ] as const) {
    circlePath(ctx, x, y, 0.022)
    part(ctx, faces.top, 'detail')
  }
}

/** The sawmill's circular blade, eight teeth, standing in a slot in the top; it spins and throws sawdust while a batch runs. */
function drawBlade(ctx: CanvasRenderingContext2D, spin: number, running: boolean, t: number, fine: boolean) {
  const r = 0.42
  const x = TOPX
  const y = TOPY
  // Sawdust flies off the front of the blade, up and to the right, falling back.
  if (running) {
    for (let i = 0; i < 9; i++) {
      const age = loop(t, 0.6, i / 9) * 0.6
      const vx = 1.0 + 0.5 * ((i * 7) % 5) * 0.2
      const vy = -1.2 - 0.6 * ((i * 3) % 4) * 0.25
      const px = x + r * 0.8 + vx * age
      const py = y - r * 0.55 + vy * age + 4.5 * age * age
      ctx.beginPath()
      ctx.ellipse(px, py, 0.03, 0.02, i, 0, TAU)
      ctx.fillStyle = i % 2 === 0 ? KIT.sawdust : KIT.sawdustDark
      ctx.fill()
    }
  }
  ctx.save()
  ctx.beginPath()
  ctx.rect(x - r - 0.1, y - r - 0.1, 2 * r + 0.2, r + 0.1)
  ctx.clip()
  ctx.translate(x, y)
  ctx.rotate(spin)
  ctx.beginPath()
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * TAU
    const a1 = ((i + 0.62) / 8) * TAU
    ctx.lineTo(Math.cos(a0) * r * 0.86, Math.sin(a0) * r * 0.86)
    ctx.lineTo(Math.cos(a1) * r, Math.sin(a1) * r)
    ctx.lineTo(Math.cos(a1 + 0.02) * r * 0.86, Math.sin(a1 + 0.02) * r * 0.86)
  }
  ctx.closePath()
  part(ctx, BOX.steel.top, 'line')
  circlePath(ctx, 0, 0, r * 0.6)
  ctx.lineWidth = lw('detail')
  ctx.strokeStyle = BOX.steel.side
  ctx.stroke()
  if (fine) {
    ctx.beginPath()
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU
      ctx.moveTo(Math.cos(a) * r * 0.24, Math.sin(a) * r * 0.24)
      ctx.lineTo(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5)
    }
    ctx.lineWidth = lw('detail') * 1.5
    ctx.strokeStyle = BOX.steel.side
    ctx.stroke()
  }
  circlePath(ctx, 0, 0, r * 0.2)
  part(ctx, MACHINE_LOOK.sawmill.side, 'line')
  ctx.restore()
  // The slot it stands in.
  ctx.beginPath()
  ctx.moveTo(x - r - 0.04, y)
  ctx.lineTo(x + r + 0.04, y)
  ctx.lineCap = 'round'
  tube(ctx, 0.03, BOX.asphalt.side)
}

/** The brick oven's dome: a round brick kiln on the top with a fire mouth that glows and flickers while it bakes (embers when it rests) and a chimney that puffs. */
function drawKiln(ctx: CanvasRenderingContext2D, running: boolean, t: number, fine: boolean) {
  const brick = MATERIAL_LOOK.bricks
  const cx = TOPX + 0.04
  const base = TOPY + 0.03
  const rx = 0.5
  const ry = 0.52
  // The chimney behind the dome's right shoulder, and its puffs.
  const chx = cx + 0.2
  const chTop = base - ry - 0.2
  if (running) {
    for (let i = 0; i < 3; i++) {
      const k = loop(t, 1.5, i / 3)
      const r = (0.05 + 0.08 * k) * (1 - smooth(0.7, 1, k))
      puff(ctx, chx + 0.04 + 0.22 * k, chTop - 0.1 - 0.32 * k, r, KIT.smoke)
    }
  }
  box(ctx, chx - 0.09, chTop, 0.18, 0.42, brick, 0.06, true, true, 'line')
  // The dome with its courses.
  const dome = () => {
    ctx.beginPath()
    ctx.ellipse(cx, base, rx, ry, 0, Math.PI, TAU)
    ctx.closePath()
  }
  dome()
  ctx.fillStyle = brick.face
  ctx.fill()
  ctx.save()
  ctx.clip()
  ctx.beginPath()
  const courses = fine ? 4 : 2
  for (let i = 1; i <= courses; i++) {
    const y = base - (ry * i) / (courses + 1)
    ctx.moveTo(cx - rx, y)
    ctx.lineTo(cx + rx, y)
  }
  if (fine)
    for (let i = 0; i <= courses; i++) {
      const y0 = base - (ry * i) / (courses + 1)
      const y1 = base - (ry * (i + 1)) / (courses + 1)
      for (let j = -3; j <= 3; j++) {
        const x = cx + (j + (i % 2) * 0.5) * 0.2
        ctx.moveTo(x, y0)
        ctx.lineTo(x, y1)
      }
    }
  ctx.lineWidth = Math.max(lw('detail'), 0.014)
  ctx.strokeStyle = brick.mark
  ctx.stroke()
  ctx.restore()
  dome()
  ink(ctx, 'edge')
  // The fire mouth: an arch, its glow, and the flames or the embers inside.
  const mx = cx - 0.04
  const mw = 0.17
  const mouth = () => {
    ctx.beginPath()
    ctx.moveTo(mx - mw, base)
    ctx.lineTo(mx - mw, base - 0.12)
    ctx.arc(mx, base - 0.12, mw, Math.PI, TAU)
    ctx.lineTo(mx + mw, base)
    ctx.closePath()
  }
  if (running) {
    circlePath(ctx, mx, base - 0.13, 0.3)
    ctx.fillStyle = C.light
    ctx.fill()
  }
  mouth()
  part(ctx, KIT.mouth, 'line')
  ctx.save()
  mouth()
  ctx.clip()
  if (running) {
    const f = 0.035 * Math.sin(TAU * 2.4 * t)
    ctx.beginPath()
    ctx.moveTo(mx - 0.14, base)
    ctx.quadraticCurveTo(mx - 0.12, base - 0.16 - f, mx - 0.03, base - 0.27 + f)
    ctx.quadraticCurveTo(mx + 0.02, base - 0.15, mx + 0.06, base - 0.22 - f)
    ctx.quadraticCurveTo(mx + 0.15, base - 0.1 + f, mx + 0.14, base)
    ctx.closePath()
    part(ctx, KIT.fire, 'detail')
    ctx.beginPath()
    ctx.moveTo(mx - 0.07, base)
    ctx.quadraticCurveTo(mx - 0.04, base - 0.13 + f, mx + 0.01, base - 0.15 - f)
    ctx.quadraticCurveTo(mx + 0.08, base - 0.08, mx + 0.07, base)
    ctx.closePath()
    ctx.fillStyle = KIT.fireHot
    ctx.fill()
  } else {
    ctx.beginPath()
    for (const [ex, er] of [
      [-0.08, 0.035],
      [0.0, 0.045],
      [0.08, 0.03],
    ] as const) {
      ctx.moveTo(mx + ex + er, base - 0.01)
      ctx.arc(mx + ex, base - 0.01, er, 0, TAU)
    }
    ctx.fillStyle = KIT.ember
    ctx.fill()
  }
  ctx.restore()
  // The arch's keystones.
  mouth()
  ctx.lineWidth = lw('line')
  ctx.strokeStyle = INK
  ctx.stroke()
}

/** The cement mixer's drum on its cradle: white with orange stripes that run round it while it mixes, rocking with each glug, a dollop of grey at its mouth. */
function drawDrum(ctx: CanvasRenderingContext2D, running: boolean, t: number, fine: boolean) {
  const orange = MACHINE_LOOK.mixer
  const cx = TOPX + 0.04
  const cy = TOPY - 0.32
  // The cradle: two steel legs from the top to under the drum.
  ctx.lineCap = 'round'
  for (const lx of [-0.24, 0.18]) {
    ctx.beginPath()
    ctx.moveTo(cx + lx, TOPY + 0.04)
    ctx.lineTo(cx + lx + 0.04, cy + 0.12)
    tube(ctx, 0.07, BOX.steel.side)
  }
  const glug = running ? 0.045 * Math.sin(TAU * 2.5 * t) : 0
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(-0.32 + glug)
  const outline = () => {
    ctx.beginPath()
    ctx.moveTo(0.16, -0.3)
    ctx.lineTo(0.46, -0.15)
    ctx.lineTo(0.46, 0.15)
    ctx.lineTo(0.16, 0.3)
    ctx.lineTo(-0.28, 0.3)
    ctx.arc(-0.28, 0, 0.3, Math.PI / 2, Math.PI * 1.5)
    ctx.closePath()
  }
  outline()
  ctx.fillStyle = KIT.drum
  ctx.fill()
  ctx.save()
  ctx.clip()
  const turn = running ? loop(t, 0.6, 0) : 0
  ctx.beginPath()
  for (let i = -3; i <= 1; i++) {
    const x = (i + turn) * 0.24
    ctx.moveTo(x, -0.3)
    ctx.lineTo(x + 0.12, -0.3)
    ctx.lineTo(x - 0.04, 0.3)
    ctx.lineTo(x - 0.16, 0.3)
    ctx.closePath()
  }
  ctx.fillStyle = orange.face
  ctx.fill()
  if (fine) {
    ctx.beginPath()
    ctx.rect(0.14, -0.32, 0.05, 0.64)
    ctx.fillStyle = BOX.steel.side
    ctx.fill()
  }
  ctx.restore()
  outline()
  ink(ctx, 'edge')
  // The mouth, and the grey dollop that glugs in it.
  ctx.beginPath()
  ctx.ellipse(0.46, 0, 0.05, 0.15, 0, 0, TAU)
  part(ctx, KIT.mouth, 'line')
  if (running) {
    const g = arch(loop(t, 0.8, 0))
    ctx.beginPath()
    ctx.ellipse(0.47 + 0.03 * g, 0.02, 0.03 + 0.04 * g, 0.08 + 0.03 * g, 0, 0, TAU)
    part(ctx, MATERIAL_LOOK.concrete.side, 'detail')
  }
  shine(ctx, -0.22, 0.02, 0.28)
  ctx.restore()
}

/** The glass oven's dome on a steel collar: the sand melting in its floor, and while it works bubbles rising that pop into little panes of glass. */
function drawBubbleDome(ctx: CanvasRenderingContext2D, running: boolean, t: number) {
  const cx = TOPX + 0.02
  const base = TOPY + 0.01
  const r = 0.42
  const dome = () => {
    ctx.beginPath()
    ctx.arc(cx, base, r, Math.PI, TAU)
    ctx.closePath()
  }
  dome()
  ctx.fillStyle = MATERIAL_LOOK.glass.face
  ctx.fill()
  ctx.save()
  ctx.clip()
  // The sand in the floor: still when it rests, glowing and wavy while it melts.
  const wave = running ? 0.02 * Math.sin(TAU * 1.5 * t) : 0
  ctx.beginPath()
  ctx.moveTo(cx - r, base)
  ctx.lineTo(cx - r, base - 0.1)
  ctx.quadraticCurveTo(cx - r / 2, base - 0.15 - wave, cx, base - 0.1)
  ctx.quadraticCurveTo(cx + r / 2, base - 0.05 + wave, cx + r, base - 0.1)
  ctx.lineTo(cx + r, base)
  ctx.closePath()
  part(ctx, running ? KIT.fireHot : RAW_LOOK.sand.body, 'detail')
  if (running) {
    for (let i = 0; i < 4; i++) {
      const u = loop(t, 1.1, i / 4)
      const bx = cx + (i - 1.5) * 0.15 + 0.03 * Math.sin(TAU * (u + i * 0.3))
      if (u < 0.65) {
        // A bubble rising and growing.
        const k = u / 0.65
        circlePath(ctx, bx, base - 0.12 - 0.2 * k, 0.025 + 0.035 * k)
        ctx.fillStyle = KIT.bubble
        ctx.fill()
        ink(ctx, 'detail')
      } else {
        // It popped: a little pane, turning as it floats up, then shrinking away.
        const k = (u - 0.65) / 0.35
        const s = 0.11 * smooth(0, 0.25, k) * (1 - smooth(0.7, 1, k))
        if (s > 0.004) {
          ctx.save()
          ctx.translate(bx, base - 0.32 - 0.04 * k)
          ctx.rotate(0.6 * k - 0.3)
          ctx.beginPath()
          ctx.rect(-s / 2, -s / 2, s, s)
          part(ctx, MATERIAL_LOOK.glass.top, 'detail')
          ctx.beginPath()
          ctx.moveTo(-s * 0.25, s * 0.2)
          ctx.lineTo(s * 0.15, -s * 0.25)
          ctx.lineWidth = lw('detail')
          ctx.strokeStyle = C.white
          ctx.stroke()
          ctx.restore()
        }
      }
    }
  }
  ctx.restore()
  dome()
  ink(ctx, 'edge')
  shine(ctx, cx, base, r)
  roundRectPath(ctx, cx - r - 0.05, base - 0.02, 2 * r + 0.1, 0.08, 0.03)
  part(ctx, BOX.steel.top, 'line')
}

/** The rainbow machine's wheel of six colours on its axle, turning while it runs, throwing a rainbow over into its chute with sparkles along it. */
function drawRainbowWheel(ctx: CanvasRenderingContext2D, faces: Faces, p: MachinePic, running: boolean, t: number) {
  const r = 0.38
  const x = TOPX
  const y = TOPY
  if (running) {
    // The arc of six bands from the wheel over into the chute: its head runs out, its tail follows.
    const u = progress(p)
    const a0 = -Math.PI / 2 + (Math.PI / 2) * smooth(0.5, 1, u)
    const a1 = -Math.PI / 2 + (Math.PI / 2) * smooth(0, 0.5, u)
    const ax = 0.3
    const ay = -0.86
    const rx = 0.54
    const ry = 1.26
    const band = 0.036
    /** The arc `o` outside its middle line, as a polyline so it reaches exactly as far as it shows. */
    const band6 = (o: number) => {
      ctx.beginPath()
      for (let i = 0; i <= 24; i++) {
        const a = mix(a0, a1, i / 24)
        ctx.lineTo(ax + Math.cos(a) * (rx + o), ay + Math.sin(a) * (ry + o))
      }
    }
    if (a1 - a0 > 0.02) {
      ctx.lineCap = 'butt'
      ctx.lineJoin = 'round'
      band6(0)
      ctx.lineWidth = band * 6 + 2 * lw('detail')
      ctx.strokeStyle = INK
      ctx.stroke()
      C.rainbow.forEach((colour, i) => {
        band6((2.5 - i) * band)
        ctx.lineWidth = band + 0.002
        ctx.strokeStyle = colour
        ctx.stroke()
      })
    }
    for (let i = 0; i < 4; i++) {
      const k = loop(t, 0.7, i / 4)
      const a = mix(a0, a1, (i + 0.5) / 4)
      const s = 0.13 * arch(k)
      if (s < 0.01 || a1 - a0 < 0.02) continue
      const off = (i % 2 === 0 ? 1 : -1) * 0.16
      sparkle(ctx, ax + Math.cos(a) * (rx + off), ay + Math.sin(a) * (ry + off), s, C.sparkle)
    }
  }
  const spin = running ? t * 3.5 : 0
  ctx.save()
  ctx.beginPath()
  ctx.rect(x - r - 0.08, y - r - 0.08, 2 * r + 0.16, r + 0.08)
  ctx.clip()
  for (let i = 0; i < 6; i++) {
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.arc(x, y, r, spin + (i / 6) * TAU, spin + ((i + 1) / 6) * TAU)
    ctx.closePath()
    ctx.fillStyle = C.rainbow[i]!
    ctx.fill()
  }
  circlePath(ctx, x, y, r)
  ink(ctx, 'edge')
  circlePath(ctx, x, y, r * 0.86)
  ctx.lineWidth = lw('detail')
  ctx.strokeStyle = C.white
  ctx.stroke()
  ctx.restore()
  circlePath(ctx, x, y, 0.08)
  part(ctx, faces.face, 'line')
  ctx.beginPath()
  ctx.moveTo(x - r - 0.04, y)
  ctx.lineTo(x + r + 0.04, y)
  ctx.lineCap = 'round'
  tube(ctx, 0.03, BOX.asphalt.side)
}

/** While the mixer runs, a pale slab slides down its chute through the second half of each batch, and shrinks away at the lip. */
function drawSlab(ctx: CanvasRenderingContext2D, p: MachinePic, t: number) {
  const u = progress(p)
  if (u < 0.4) return
  const k = smooth(0.4, 0.92, u)
  const s = 0.5 * (1 - smooth(0.88, 1, u))
  if (s < 0.02) return
  const { x0, y0, x1, y1, lip } = CHUTE
  ctx.save()
  ctx.translate(mix(x0 + lip * 0.6, x1 - 0.05, k), mix(y0, y1, k) - lip * 0.5)
  ctx.rotate(Math.atan2(y1 - y0, x1 - x0))
  ctx.scale(s, s)
  drawGood(ctx, 'concrete', t)
  ctx.restore()
}

/** The whole built machine at rest at the origin. */
function drawBuilt(ctx: CanvasRenderingContext2D, m: MachineId, p: MachinePic, t: number) {
  const faces = MACHINE_LOOK[m]
  const { takes, makes } = RECIPES[m]
  const fine = detail(2.6) === 'L'
  const some = detail(2.6) !== 'S'
  const running = p.on && p.batchAge < p.batchFor + 0.2
  drawPlinth(ctx)
  drawLever(ctx, p.pushAge)
  box(ctx, BODY.x, BODY.y, BODY.w, BODY.h, faces, D, true, true, 'edge')
  switch (m) {
    case 'sawmill':
      drawBlade(ctx, running ? -t * 9 : -0.3, running, t, some)
      break
    case 'oven':
      drawKiln(ctx, running, t, some)
      break
    case 'mixer':
      drawDrum(ctx, running, t, some)
      break
    case 'glassworks':
      drawBubbleDome(ctx, running, t)
      break
    case 'rainbow':
      drawRainbowWheel(ctx, faces, p, running, t)
      break
  }
  drawHopper(ctx, takes, t)
  drawLamp(ctx, p.ready, t)
  drawGauge(ctx, p, fine)
  drawPlate(ctx, takes, makes, t, some)
  if (fine) drawRivets(ctx, faces)
  drawChute(ctx)
  if (m === 'mixer' && running) drawSlab(ctx, p, t)
}

/** The empty pad: a low concrete slab striped with hazard bands, with four bolt plates where the feet will stand. */
function drawPad(ctx: CanvasRenderingContext2D) {
  box(ctx, -1.0, -0.16, 1.9, 0.16, BOX.yellow, D, true, true, 'edge')
  hazard(ctx, -1.0, -0.16, 1.9, 0.16)
  ctx.beginPath()
  ctx.rect(-1.0, -0.16, 1.9, 0.16)
  ink(ctx, 'edge')
  for (const [x, y] of [
    [-0.72, -0.16 - D * 0.3],
    [0.5, -0.16 - D * 0.3],
    [-0.62, -0.16 - D * 0.75],
    [0.62, -0.16 - D * 0.75],
  ] as const) {
    ctx.beginPath()
    ctx.ellipse(x, y, 0.09, 0.035, 0, 0, TAU)
    part(ctx, BOX.steel.top, 'detail')
  }
}

/** The faint blueprint ghost of the machine a pad waits for: the outlines of its plinth, body, hopper, top part and chute, dashed, in the ghost's colours. */
function drawGhost(ctx: CanvasRenderingContext2D, m: MachineId) {
  ctx.save()
  ctx.beginPath()
  ctx.rect(PLINTH.x, PLINTH.y, PLINTH.w, PLINTH.h)
  ctx.moveTo(BODY.x, BODY.y + BODY.h)
  ctx.lineTo(BODY.x, BODY.y)
  ctx.lineTo(BODY.x + D, BODY.y - D)
  ctx.lineTo(BODY.x + BODY.w + D, BODY.y - D)
  ctx.lineTo(BODY.x + BODY.w + D, BODY.y + BODY.h - D)
  ctx.lineTo(BODY.x + BODY.w, BODY.y + BODY.h)
  ctx.closePath()
  ctx.moveTo(-1.02, -2.38)
  ctx.lineTo(-0.34, -2.38)
  ctx.lineTo(-0.5, -1.96)
  ctx.lineTo(-0.86, -1.96)
  ctx.closePath()
  ctx.moveTo(CHUTE.x0, CHUTE.y0)
  ctx.lineTo(CHUTE.x1, CHUTE.y1)
  ctx.lineTo(CHUTE.x1 + CHUTE.lip, CHUTE.y1 - CHUTE.lip)
  ctx.lineTo(CHUTE.x0 + CHUTE.lip, CHUTE.y0 - CHUTE.lip)
  ctx.closePath()
  switch (m) {
    case 'sawmill':
    case 'rainbow':
      ctx.moveTo(TOPX + 0.42, TOPY)
      ctx.arc(TOPX, TOPY, 0.42, 0, Math.PI, true)
      break
    case 'oven':
      ctx.moveTo(TOPX + 0.54, TOPY + 0.03)
      ctx.ellipse(TOPX + 0.04, TOPY + 0.03, 0.5, 0.52, 0, 0, Math.PI, true)
      ctx.rect(TOPX + 0.15, TOPY - 0.69, 0.18, 0.3)
      break
    case 'mixer':
      ctx.moveTo(TOPX + 0.48, TOPY - 0.32)
      ctx.ellipse(TOPX + 0.04, TOPY - 0.32, 0.46, 0.3, -0.32, 0, TAU)
      break
    case 'glassworks':
      ctx.moveTo(TOPX + 0.44, TOPY)
      ctx.arc(TOPX + 0.02, TOPY, 0.42, 0, Math.PI, true)
      break
  }
  ctx.fillStyle = C.ghostFill
  ctx.fill()
  ctx.setLineDash([0.1, 0.07])
  ctx.lineWidth = lw('line')
  ctx.strokeStyle = C.ghostLine
  ctx.stroke()
  ctx.setLineDash([])
  ctx.restore()
}

/** The bubble over an empty pad with the raw good it waits for, bobbing gently, its tail of two little rounds pointing down at the pad. */
function drawWish(ctx: CanvasRenderingContext2D, raw: Raw, t: number) {
  const bob = 0.03 * Math.sin(TAU * (t / 2.4 + phaseOf(raw)))
  const x = -0.05
  const y = -1.38 + bob
  const r = 0.4
  blob(ctx, [x, y, r, x - r * 0.62, y + r * 0.2, r * 0.62, x + r * 0.64, y + r * 0.18, r * 0.62, x, y + r * 0.35, r * 0.7], C.white, 'line')
  for (const [cx, cy, cr] of [
    [x + 0.06, y + r * 0.95 + 0.12, 0.08],
    [x + 0.12, y + r * 0.95 + 0.32, 0.05],
  ] as const) {
    circlePath(ctx, cx, cy, cr)
    part(ctx, C.white, 'line')
  }
  ctx.save()
  ctx.translate(x, y + 0.27)
  ctx.scale(1.05, 1.05)
  drawGood(ctx, raw, t)
  ctx.restore()
}

/** The crate's front: boards across, a frame round it and a brace, and the label with the raw good's picture. */
function drawCrateFront(ctx: CanvasRenderingContext2D, raw: Raw, t: number) {
  const wood = MATERIAL_LOOK.planks
  const { x, y, w, h } = CRATE
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  part(ctx, wood.face, 'edge')
  ctx.beginPath()
  for (let i = 1; i < 4; i++) {
    ctx.moveTo(x, y + (h * i) / 4)
    ctx.lineTo(x + w, y + (h * i) / 4)
  }
  ink(ctx, 'detail')
  ctx.beginPath()
  ctx.moveTo(x + 0.1, y + h - 0.1)
  ctx.lineTo(x + w - 0.1, y + 0.1)
  ctx.lineCap = 'round'
  tube(ctx, 0.12, wood.side)
  ctx.lineCap = 'butt'
  ctx.beginPath()
  ctx.rect(x + 0.06, y + 0.06, w - 0.12, h - 0.12)
  ctx.lineWidth = 0.12
  ctx.strokeStyle = wood.side
  ctx.stroke()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.rect(x + 0.12, y + 0.12, w - 0.24, h - 0.24)
  ink(ctx, 'line')
  roundRectPath(ctx, x + w / 2 - 0.36, y + h / 2 - 0.32, 0.72, 0.64, 0.06)
  part(ctx, KIT.crateLabel, 'line')
  ctx.save()
  ctx.translate(x + w / 2, y + h / 2 + 0.24)
  drawGood(ctx, raw, t)
  ctx.restore()
}

/** The crate the crane drops: wooden boards, a brace, the raw good's picture on a label; each hit cracks a board and shakes it. */
function drawCrate(ctx: CanvasRenderingContext2D, raw: Raw, hits: number, hitAge: number, t: number) {
  const { x, y, w, h } = CRATE
  const shake = hitAge < 0.4 ? 0.06 * Math.sin(hitAge * 50) * (1 - hitAge / 0.4) : 0
  ctx.save()
  ctx.rotate(shake)
  box(ctx, x, y, w, h, MATERIAL_LOOK.planks, D, true, true, 'edge')
  drawCrateFront(ctx, raw, t)
  // A crack per hit.
  ctx.beginPath()
  for (let i = 0; i < Math.min(hits, 3); i++) {
    const cx = x + 0.25 + i * 0.45
    const cy = y + 0.2 + (i % 2) * 0.75
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx + 0.08, cy + 0.1)
    ctx.lineTo(cx + 0.02, cy + 0.18)
    ctx.lineTo(cx + 0.1, cy + 0.28)
  }
  ink(ctx, 'line')
  ctx.restore()
}

/** One of the crate's walls falling open about its hinge on the ground: `turn` radians, shrunk by `s` about the hinge, boards on its face. */
function petal(ctx: CanvasRenderingContext2D, hx: number, turn: number, s: number, x0: number, w: number) {
  const wood = MATERIAL_LOOK.planks
  ctx.save()
  ctx.translate(hx, 0)
  ctx.rotate(turn)
  ctx.scale(s, s)
  ctx.beginPath()
  ctx.rect(x0, -CRATE.h, w, CRATE.h)
  part(ctx, wood.side, 'line')
  ctx.beginPath()
  for (let i = 1; i < 4; i++) {
    ctx.moveTo(x0, (-CRATE.h * i) / 4)
    ctx.lineTo(x0 + w, (-CRATE.h * i) / 4)
  }
  ink(ctx, 'detail')
  ctx.restore()
}

/**
 * The crate opening, `age` seconds after the last hit: its side walls fall open like
 * petals and its front falls flat towards us, the lid tumbles off, the machine rises out
 * of the middle with a squash and a ring of puffs, and the fallen walls shrink away.
 */
function drawUnfold(ctx: CanvasRenderingContext2D, m: MachineId, p: MachinePic, t: number, age: number) {
  const wood = MATERIAL_LOOK.planks
  const fall = smooth(0, FALL, age)
  const flop = fall + 0.06 * arch(clamp01((age - FALL) / 0.18))
  const gone = 1 - smooth(0.55, 0.95, age)
  if (gone > 0.01) {
    petal(ctx, CRATE.x, -flop * (Math.PI / 2), gone, -0.12, 0.12)
    petal(ctx, CRATE.x + CRATE.w + D * 0.5, flop * (Math.PI / 2), gone, 0, 0.12)
  }
  // The machine grows up out of the middle from its feet on the ground (never under it), and lands with a squash.
  const rise = smooth(RISE_FROM, RISE_TO, age)
  const [sx, sy] = squash(age - RISE_TO)
  if (rise > 0.01) {
    ctx.save()
    ctx.scale(sx * mix(0.3, 1, rise), sy * mix(0.3, 1, rise))
    drawBuilt(ctx, m, p, t)
    ctx.restore()
  }
  if (gone > 0.01) {
    // The front falls flat towards us, label and all; once it is down it shows its plain inside.
    const k = Math.cos(flop * Math.PI * 0.58)
    ctx.save()
    ctx.scale(gone, k * gone)
    if (k > 0) drawCrateFront(ctx, RECIPES[m].takes, t)
    else {
      ctx.beginPath()
      ctx.rect(CRATE.x, -CRATE.h, CRATE.w, CRATE.h)
      part(ctx, wood.top, 'line')
    }
    ctx.restore()
    // The lid hops up off the top, flipping, and shrinks away.
    const lid = 1 - smooth(0.15, 0.45, age)
    if (lid > 0.01) {
      ctx.save()
      ctx.translate(0.45 * fall, -CRATE.h - D * 0.5 - 0.45 * arch(clamp01(age / 0.6)))
      ctx.rotate(fall * 1.2)
      ctx.scale(lid, lid)
      box(ctx, -0.7, -0.07, 1.4, 0.14, wood, D * 0.5, true, true, 'line')
      ctx.restore()
    }
  }
  // A ring of puffs round the foot, growing and shrinking away.
  const r = 0.15 * smooth(0.05, 0.3, age) * (1 - smooth(0.5, 0.9, age))
  for (const [px, py] of [
    [-0.95, -0.1],
    [-0.5, 0.02],
    [0.45, 0.02],
    [0.95, -0.1],
  ] as const)
    puff(ctx, px * (1 + 0.25 * smooth(0, 0.8, age)), py - 0.1 * age, r, KIT.smoke)
}

/** The machine (or its pad, or its crate), origin at the bottom centre of layout.machineRect. */
export function drawMachine(ctx: CanvasRenderingContext2D, m: MachineId, p: MachinePic, t: number): void {
  const raw = RECIPES[m].takes
  ctx.save()
  ctx.lineJoin = 'round'
  groundShadow(ctx, p.stage === 'pad' ? 2.0 : 2.3)
  if (p.stage === 'pad') {
    drawGhost(ctx, m)
    drawPad(ctx)
    drawWish(ctx, raw, t)
  } else if (p.stage === 'crate') {
    drawPad(ctx)
    drawCrate(ctx, raw, p.hits, p.hitAge, t)
  } else if (p.builtAge < UNFOLD) {
    drawUnfold(ctx, m, p, t, heldAge(p.builtAge))
  } else {
    // A push squashes; a run chugs; a cough shakes and puffs grey; a ready machine hops now and then.
    const [sx, sy] = squash(p.pushAge)
    const chug = p.on ? 1 + 0.015 * Math.sin(TAU * 4 * t) : 1
    const coughAge = heldAge(p.coughAge)
    const cough = coughAge < 0.5 ? 0.05 * Math.sin(coughAge * 60) * (1 - coughAge / 0.5) : 0
    const hopU = loop(t, 3, phaseOf(m))
    const hop = p.ready && !p.on && hopU < 0.12 ? -0.12 * arch(hopU / 0.12) : 0
    ctx.save()
    ctx.translate(cough, hop)
    ctx.scale(sx, sy * chug)
    drawBuilt(ctx, m, p, t)
    ctx.restore()
    if (coughAge < 0.8) {
      // A small grey puff from the hopper, growing and then shrinking away.
      const k = coughAge / 0.8
      puff(ctx, -0.69, -2.55 - 0.4 * k, (0.08 + 0.08 * k) * (1 - smooth(0.6, 1, k)), KIT.cough)
    }
  }
  ctx.restore()
}

/** Where the heap's goods lie, [x, y] with a little tilt, filled in this order so a heap of any size is a mound: the bottom middle first, a second row as soon as it can, the top last. */
const HEAP_SLOTS = [
  [0, 0, 0.04],
  [-0.36, 0, -0.06],
  [0.36, 0, 0.07],
  [-0.18, -0.24, 0.1],
  [0.18, -0.24, -0.08],
  [0, -0.47, 0.03],
  [-0.72, 0.01, 0.12],
  [0.72, 0.01, -0.1],
  [-0.54, -0.23, -0.04],
  [0.54, -0.23, 0.09],
  [-0.36, -0.46, -0.12],
  [0.36, -0.46, 0.06],
] as const
/** A heaped good is drawn at this scale of drawGood, a little bigger or smaller by its slot. */
const HEAP_SCALE = 0.78

/** A heap of `n` raw goods (up to 12 drawn), origin at the bottom centre of layout.heapRect. */
export function drawHeap(ctx: CanvasRenderingContext2D, good: Raw, n: number, t: number): void {
  const count = Math.min(n, HEAP_SLOTS.length)
  if (count === 0) return
  // Lower rows first, so the goods on top lie over the ones under them.
  const order = HEAP_SLOTS.slice(0, count)
    .map((s, i) => [s[0], s[1], s[2], i] as const)
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
  ctx.save()
  groundShadow(ctx, 0.5 + 0.2 * Math.min(count, 7))
  for (const [x, y, tilt, i] of order) {
    const k = HEAP_SCALE * (1 + ((i * 5) % 3) * 0.03 - 0.03)
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(tilt)
    ctx.scale(i % 4 === 3 ? -k : k, k)
    drawGood(ctx, good, t + i * 0.3)
    ctx.restore()
  }
  ctx.restore()
}

/** Blocks in a stack are drawn at this scale of drawGood, in rows of STACK_ROW, at most STACK_MAX, on a pallet PALLET tall. */
const STACK_SCALE = 0.57
const STACK_ROW = 5
const STACK_MAX = 25
const PALLET = { w: 1.48, h: 0.09, d: 0.08 }

/** A stack of `n` made blocks in rows of five (up to five rows drawn) on a pallet, origin at the bottom centre of layout.stackRect; an empty stack is the bare pallet, waiting. */
export function drawStack(ctx: CanvasRenderingContext2D, good: Material, n: number, t: number): void {
  const count = Math.min(n, STACK_MAX)
  const { w, h } = BLOCK[good]
  const k = STACK_SCALE
  const wood = MATERIAL_LOOK.planks
  const px = -(PALLET.w + PALLET.d) / 2
  ctx.save()
  ctx.lineJoin = 'round'
  groundShadow(ctx, PALLET.w + 0.1)
  box(ctx, px, -PALLET.h, PALLET.w, PALLET.h, wood, PALLET.d, true, true, 'line')
  ctx.beginPath()
  for (const gx of [0.22, 0.6, 0.78]) ctx.rect(px + PALLET.w * gx, -PALLET.h * 0.62, PALLET.w * 0.16, PALLET.h * 0.62)
  ctx.fillStyle = wood.side
  ctx.fill()
  const x0 = -(STACK_ROW * w + BLOCK_DEPTH) * k * 0.5
  for (let i = 0; i < count; i++) {
    const col = i % STACK_ROW
    const row = Math.floor(i / STACK_ROW)
    ctx.save()
    ctx.translate(x0 + (col * w + (w + BLOCK_DEPTH) / 2) * k, -PALLET.h - row * h * k)
    ctx.scale(k, k)
    drawGood(ctx, good, t + i * 0.37)
    ctx.restore()
  }
  ctx.restore()
}

/** A sheet moment for a machine: idle and ready, or a batch half-way through. */
export const machinePic = (stage: MachineStage, on: boolean, t: number): MachinePic => ({
  stage,
  on,
  batchAge: on ? t % 0.8 : Infinity,
  batchFor: 0.8,
  pushAge: Infinity,
  coughAge: Infinity,
  hits: stage === 'crate' ? Math.floor(t % 4) : 0,
  hitAge: stage === 'crate' ? t % 1 : Infinity,
  builtAge: Infinity,
  ready: !on,
})

/** A machine's box on the sheet, with room over it for the oven's smoke and the rainbow. */
const MACHINE_BOX = rect(-1.3, -3.4, 2.65, 3.5)
/** An unfolding crate's box: its side walls fall open to lie either side of the machine, and its front falls flat towards us, under the ground line. */
const UNFOLD_BOX = rect(-2.15, -3.4, 4.2, 3.85)

export const MACHINE_SHEET: SheetEntry[] = [
  ...MACHINES.flatMap((m): SheetEntry[] => [
    { label: `${m} idle`, box: MACHINE_BOX, draw: (ctx, t) => drawMachine(ctx, m, machinePic('built', false, t), t) },
    { label: `${m} running`, box: MACHINE_BOX, draw: (ctx, t) => drawMachine(ctx, m, machinePic('built', true, t), t) },
    { label: `${m} pad`, box: MACHINE_BOX, draw: (ctx, t) => drawMachine(ctx, m, machinePic('pad', false, t), t) },
    { label: `${m} crate`, box: MACHINE_BOX, draw: (ctx, t) => drawMachine(ctx, m, machinePic('crate', false, t), t) },
    { label: `${m} unfolds (replays)`, box: UNFOLD_BOX, draw: (ctx, t) => drawMachine(ctx, m, { ...machinePic('built', false, t), builtAge: t % 2.2 }, t) },
    { label: `${m} heap, 0 to 13`, box: rect(-1.05, -1.1, 2.1, 1.15), draw: (ctx, t) => drawHeap(ctx, RECIPES[m].takes, Math.floor(t * 2) % 14, t) },
    { label: `${m} stack, 0 to 27`, box: rect(-0.85, -1.3, 1.7, 1.35), draw: (ctx, t) => drawStack(ctx, RECIPES[m].makes, Math.floor(t * 4) % 28, t) },
  ]),
  {
    label: 'pushed, then coughing (replays)',
    box: MACHINE_BOX,
    draw: (ctx, t) => drawMachine(ctx, 'oven', { ...machinePic('built', false, t), pushAge: t % 3, coughAge: t % 3 >= 1.4 ? (t % 3) - 1.4 : Infinity, ready: false }, t),
  },
  { label: 'full heaps', box: rect(-1.1, -1.1, 2.2 * MACHINES.length, 1.15), draw: (ctx, t) => row(ctx, (m) => drawHeap(ctx, RECIPES[m].takes, 12, t)) },
  { label: 'full stacks', box: rect(-1.1, -1.3, 2.2 * MACHINES.length, 1.35), draw: (ctx, t) => row(ctx, (m) => drawStack(ctx, RECIPES[m].makes, 25, t)) },
]

/** Draws one thing per machine in a row, 2.2 m apart. */
function row(ctx: CanvasRenderingContext2D, draw: (m: MachineId) => void) {
  MACHINES.forEach((m, i) => {
    ctx.save()
    ctx.translate(i * 2.2, 0)
    draw(m)
    ctx.restore()
  })
}
