import { BEE_BOX, BOSS_BOX, GRUMBLE_BOX, POOF_FOR, SHELL_BOX, SHELL_PEEK, SHELL_WAKE, SNAIL_BOX, YAWN_FOR, since, type Enemy, type Kitten } from '../game/model'
import { INK, LINE, LINE_DETAIL, blob, bubbleBall, inkPart, lw, pen, type Rim } from './look'
import { DEG, TAU, arch, clamp01, flatPart, ink, lidPath, mix, smooth, spiralPath, tube, wavePath, zeePath } from './parts'

/**
 * The enemies and the kittens. Enemies wear cool colours, brows and frowns (brows mean
 * grumpy); kittens wear warm coats and smiles and never brows. Every function draws around
 * the feet centre at the origin, facing right; the caller mirrors.
 */

/** How an enemy's face looks: awake and grumpy, asleep, mid-yawn, knocked silly, or worried in a bubble. */
type Mood = 'awake' | 'asleep' | 'yawn' | 'dazed' | 'worried'

const GRUMBLE = { body: '#ACA3BF', tips: '#D0C8DE', shade: '#8C83A1', feet: '#5A4F6E', feetShade: '#463D57' } as const
const SNAIL = { body: '#B4C0E8', shade: '#8F9BC9', shell: '#2FB5A8', shellShade: '#228F86', swirl: '#CFF7F1' } as const
const BEE = { body: '#FFE066', shade: '#F2C14E', cheek: '#FF9EB0' } as const
const SOCK = { white: '#FFFFFF', stripe: '#FF8C94' } as const

/** The grumble's fluff ring: each circle's radius, clockwise from the top. */
const FLUFF = [0.16, 0.14, 0.17, 0.13, 0.15, 0.16, 0.13, 0.17, 0.14, 0.15] as const

/** The box the art fills for an enemy's kind, state and hp (the Big Grumble shrinks with every stomp). */
function boxOf(kind: Enemy['kind'], state: Enemy['state'], hp: number): readonly [number, number] {
  if (state === 'bunny') return [0.7, 0.6]
  if (kind === 'boss') return BOSS_BOX[Math.min(3, Math.max(1, hp)) - 1]!
  if (kind === 'snail') return state === 'shell' || state === 'slide' ? SHELL_BOX : SNAIL_BOX
  return kind === 'bee' ? BEE_BOX : GRUMBLE_BOX
}

/** Rising sleepy 'z's over (x, y): one every 0.8 s, each rising 0.6 over 1.2 s. */
function snore(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, line: number, rim: Rim) {
  for (let i = 0; i < 2; i++) {
    const age = (t % 0.8) + i * 0.8
    if (age >= 1.2) continue
    const u = age / 1.2
    ctx.save()
    ctx.globalAlpha *= 0.6 * Math.sin(Math.PI * u)
    zeePath(ctx, x + 0.12 * u + 0.04 * Math.sin(u * 7), y - 0.6 * u, 0.18 * (0.7 + 0.5 * u))
    ink(ctx, line, rim)
    ctx.restore()
  }
}

/** A pair of grumpy-thing eyes at (+-dx, y): white with a pupil looking forward, in every mood. */
function eyePair(ctx: CanvasRenderingContext2D, xs: readonly number[], y: number, rx: number, ry: number, mood: Mood, u: number, t: number, line: number) {
  xs.forEach((x, i) => {
    if (mood === 'asleep' || (mood === 'yawn' && u < 0.8)) {
      lidPath(ctx, x, y + ry * 0.2, rx * 1.1, false)
      ink(ctx, line, null)
      return
    }
    if (mood === 'dazed') {
      spiralPath(ctx, x, y, ry * 0.9, 1.5, t * 9 + i * Math.PI)
      ink(ctx, line, null)
      return
    }
    // A pop: the eyes open wide at the end of the yawn.
    const pop = mood === 'yawn' ? 1.2 : 1
    ctx.beginPath()
    ctx.ellipse(x, y, rx * pop, ry * pop, 0, 0, TAU)
    ctx.fillStyle = '#FFFFFF'
    ctx.fill()
    ink(ctx, line, null)
    ctx.beginPath()
    const look = mood === 'worried' ? [0, -ry * 0.4] : [rx * 0.43, ry * 0.1]
    ctx.arc(x + look[0]!, y + look[1]!, rx * 0.5, 0, TAU)
    ctx.fillStyle = INK
    ctx.fill()
  })
}

/** Brows over eyes at xs: angry (inner ends down) or worried (inner ends up), `w` thick. */
function brows(ctx: CanvasRenderingContext2D, xs: readonly number[], y: number, len: number, w: number, worried: boolean, rim: Rim) {
  const tilt = (worried ? -20 : 20) * DEG
  for (const x of xs) {
    const inward = -Math.sign(x) || 1
    const dx = (Math.cos(tilt) * len) / 2
    const dy = (Math.sin(tilt) * len) / 2
    ctx.beginPath()
    ctx.moveTo(x - inward * dx, y - dy)
    ctx.lineTo(x + inward * dx, y + dy)
    ink(ctx, w, rim)
  }
}

/**
 * A grumble (or, scaled up with `boss` on, the Big Grumble): a dust bunny, a core and a
 * ring of fluff drawn as one blob, two dark feet, a grumpy face. `line` is the ink width in
 * its own units (thinner when scaled up, so the ink stays the house width).
 */
function grumble(ctx: CanvasRenderingContext2D, mood: Mood, u: number, walking: boolean, t: number, line: number, boss: boolean, rim: Rim) {
  const step = walking ? Math.sin(TAU * 1.5 * t) : 0
  // Feet, alternating as it walks; knocked over, they stick up over its body and kick.
  const feet = () => {
    for (const side of [-1, 1]) {
      const lift = walking ? 0.04 * Math.max(0, side * step) : mood === 'dazed' ? 0.05 + 0.04 * Math.sin(TAU * 4 * t + side) : 0
      inkPart(
        ctx,
        (c) => {
          c.beginPath()
          c.ellipse(side * 0.15, -0.055 - lift, 0.1, 0.06, 0, 0, TAU)
        },
        GRUMBLE.feet,
        GRUMBLE.feetShade,
        0.025,
        line * 0.6,
        rim,
      )
    }
  }
  if (mood !== 'dazed') feet()
  const jiggle = mood === 'asleep' ? 0.015 : 0.045
  const xyr = [0, -0.4, 0.3]
  FLUFF.forEach((r, i) => {
    const a = -Math.PI / 2 + (i * TAU) / FLUFF.length
    xyr.push(Math.cos(a) * 0.26, -0.4 + Math.sin(a) * 0.245, r * (1 + jiggle * Math.sin(TAU * 3 * t + i * 1.7)))
  })
  blob(ctx, xyr, GRUMBLE.body, GRUMBLE.shade, 0.06, line, rim)
  if (mood === 'dazed') feet()
  if (rim) return
  // Light tips on the upper fluff.
  ctx.strokeStyle = GRUMBLE.tips
  for (let i = 3; i < xyr.length; i += 3) {
    if (xyr[i + 1]! > -0.42) continue
    const r = xyr[i + 2]!
    ctx.beginPath()
    ctx.arc(xyr[i]!, xyr[i + 1]!, r * 0.62, Math.PI * 1.15, Math.PI * 1.85)
    ctx.lineWidth = r * 0.28
    ctx.stroke()
  }
  const detail = line * 0.75
  eyePair(ctx, [-0.11, 0.11], -0.45, 0.07, 0.085, mood, u, t, detail)
  if (mood === 'awake' || mood === 'worried' || mood === 'yawn')
    brows(ctx, [-0.11, 0.11], mood === 'worried' ? -0.58 : -0.565, 0.12, boss ? line * 1.15 : line * 0.75, mood === 'worried', null)
  if (mood === 'yawn' && u < 0.85) {
    // The yawn: a big round mouth.
    const open = arch(clamp01(u / 0.85))
    ctx.beginPath()
    ctx.ellipse(0, -0.29, 0.06 + 0.02 * open, 0.03 + 0.06 * open, 0, 0, TAU)
    ctx.fillStyle = '#6B3550'
    ctx.fill()
    ink(ctx, detail, null)
  } else if (mood === 'dazed') {
    ctx.beginPath()
    ctx.ellipse(0, -0.29, 0.035, 0.045, 0, 0, TAU)
    ctx.fillStyle = '#6B3550'
    ctx.fill()
    ink(ctx, detail, null)
  } else if (mood === 'asleep') {
    ctx.beginPath()
    ctx.ellipse(0, -0.3, 0.025, 0.02 + 0.012 * Math.sin(TAU * 0.5 * t), 0, 0, TAU)
    ink(ctx, detail, null)
  } else if (boss) {
    // A pout: corners down, the lower lip pushed out.
    ctx.beginPath()
    ctx.moveTo(-0.075, -0.27)
    ctx.quadraticCurveTo(0, -0.33, 0.075, -0.27)
    ink(ctx, detail, null)
    ctx.beginPath()
    ctx.moveTo(-0.035, -0.295)
    ctx.quadraticCurveTo(0, -0.245, 0.035, -0.295)
    ink(ctx, detail * 0.8, null)
  } else {
    wavePath(ctx, 0, -0.3, 0.12, mood === 'worried' ? 0.012 : 0.025, mood === 'worried' ? 3 : 1)
    ink(ctx, detail, null)
  }
}

/** The lost sock the Big Grumble wears as a hat, its toe flopped back. Grumble units, its cuff on the crown. */
function sockHat(ctx: CanvasRenderingContext2D, line: number, rim: Rim) {
  const trace = (c: CanvasRenderingContext2D) => {
    c.beginPath()
    // Up the sock's back from the cuff, round the heel, along the top of the foot to the toe.
    c.moveTo(0.16, -0.75)
    c.lineTo(0.12, -1.0)
    c.quadraticCurveTo(0.14, -1.1, 0.06, -1.12)
    c.lineTo(-0.2, -1.1)
    c.quadraticCurveTo(-0.36, -1.08, -0.37, -0.96)
    c.quadraticCurveTo(-0.37, -0.88, -0.29, -0.88)
    // Under the foot back toward the leg, then down the sock's front to the cuff.
    c.quadraticCurveTo(-0.22, -0.89, -0.21, -0.96)
    c.lineTo(-0.1, -0.97)
    c.lineTo(-0.15, -0.76)
    c.quadraticCurveTo(0, -0.8, 0.16, -0.75)
    c.closePath()
  }
  if (rim) {
    inkPart(ctx, trace, '', '', 0, line, rim)
    return
  }
  trace(ctx)
  ctx.fillStyle = SOCK.white
  ctx.fill()
  ctx.save()
  ctx.clip()
  ctx.fillStyle = SOCK.stripe
  // Two stripes round the leg, a pink heel at the bend and a pink toe at the end: a sock.
  for (const y of [-0.86, -0.94]) {
    ctx.beginPath()
    ctx.rect(-0.3, y - 0.035, 0.6, 0.035)
    ctx.fill()
  }
  for (const [x, y, r] of [
    [0.1, -1.1, 0.08],
    [-0.36, -0.98, 0.11],
  ] as const) {
    ctx.beginPath()
    ctx.arc(x, y, r, 0, TAU)
    ctx.fill()
  }
  ctx.restore()
  trace(ctx)
  ctx.lineWidth = lw(line)
  ctx.strokeStyle = INK
  ctx.stroke()
  // The cuff.
  ctx.beginPath()
  ctx.moveTo(-0.16, -0.8)
  ctx.quadraticCurveTo(0, -0.85, 0.15, -0.8)
  ink(ctx, line * 0.6, null)
}

/** The snail walking: foot, shell with its swirl, eyes on stalks with cheeky half-lids. */
function snail(ctx: CanvasRenderingContext2D, mood: Mood, u: number, walking: boolean, t: number, line: number, rim: Rim) {
  const ripple = (x: number) => (walking ? 0.02 * (0.5 + 0.5 * Math.sin(x * 18 - TAU * 4 * t)) : 0)
  // Eye stalks behind the head: drooped and short asleep, tall once awake.
  const up = mood === 'asleep' || (mood === 'yawn' && u < 0.6) ? 0.55 : mood === 'yawn' ? 1.1 : 1
  const stalks = [
    [0.3, -0.4 - 0.28 * up],
    [0.45, -0.4 - 0.26 * up],
  ] as const
  for (const [x, y] of stalks) {
    ctx.beginPath()
    ctx.moveTo(0.36, -0.36)
    ctx.quadraticCurveTo(0.38, -0.5, x, y)
    tube(ctx, 0.045, SNAIL.body, line * 0.55, rim)
  }
  inkPart(
    ctx,
    (c) => {
      c.beginPath()
      c.moveTo(-0.5, -0.03)
      for (let x = -0.46; x <= 0.42; x += 0.06) c.lineTo(x, -ripple(x))
      c.quadraticCurveTo(0.5, 0, 0.5, -0.18)
      c.quadraticCurveTo(0.49, -0.42, 0.36, -0.43)
      c.quadraticCurveTo(0.24, -0.43, 0.2, -0.24)
      c.lineTo(-0.3, -0.16)
      c.quadraticCurveTo(-0.46, -0.13, -0.5, -0.03)
      c.closePath()
    },
    SNAIL.body,
    SNAIL.shade,
    0.05,
    line,
    rim,
  )
  shell(ctx, -0.08, -0.42, 0, false, line, rim)
  if (rim) {
    for (const [x, y] of stalks) {
      ctx.beginPath()
      ctx.arc(x, y, 0.065, 0, TAU)
      ink(ctx, line * 0.55, rim)
    }
    return
  }
  const detail = line * 0.6
  stalks.forEach(([x, y], i) => {
    ctx.beginPath()
    ctx.arc(x, y, 0.065, 0, TAU)
    ctx.fillStyle = '#FFFFFF'
    ctx.fill()
    ink(ctx, detail, null)
    if (mood === 'asleep' || (mood === 'yawn' && u < 0.8)) {
      lidPath(ctx, x, y, 0.05, false)
      ink(ctx, detail, null)
      return
    }
    if (mood === 'dazed') {
      spiralPath(ctx, x, y, 0.055, 1.5, t * 9 + i * Math.PI)
      ink(ctx, detail, null)
      return
    }
    const look = mood === 'worried' ? [0, -0.025] : [0.022, 0.01]
    ctx.beginPath()
    ctx.arc(x + look[0]!, y + look[1]!, 0.03, 0, TAU)
    ctx.fillStyle = INK
    ctx.fill()
    if (mood === 'awake') {
      // The cheeky half-lid.
      ctx.beginPath()
      ctx.arc(x, y, 0.065, Math.PI * 1.08, Math.PI * 1.92)
      ctx.closePath()
      ctx.fillStyle = INK
      ctx.fill()
    }
  })
  // The mouth on the head's front: a smirk, a yawn, or an 'o'.
  if (mood === 'yawn' && u < 0.85) {
    ctx.beginPath()
    ctx.ellipse(0.43, -0.24, 0.035, 0.03 + 0.04 * arch(u / 0.85), 0, 0, TAU)
    ctx.fillStyle = '#6B3550'
    ctx.fill()
    ink(ctx, detail, null)
  } else if (mood === 'dazed' || mood === 'worried') {
    ctx.beginPath()
    ctx.ellipse(0.43, -0.24, 0.025, 0.03, 0, 0, TAU)
    ink(ctx, detail, null)
  } else {
    ctx.beginPath()
    ctx.moveTo(0.37, -0.25)
    ctx.quadraticCurveTo(0.43, -0.22, 0.48, -0.28)
    ink(ctx, detail, null)
  }
}

/** The snail's shell at (x, y): a teal disc with a light swirl turned by `spin` and a shine; `peek` adds the opening it rests on. */
function shell(ctx: CanvasRenderingContext2D, x: number, y: number, spin: number, peek: boolean, line: number, rim: Rim) {
  const trace = (c: CanvasRenderingContext2D) => {
    c.beginPath()
    c.arc(x, y, 0.36, 0, TAU)
  }
  inkPart(ctx, trace, SNAIL.shell, SNAIL.shellShade, 0.07, line, rim)
  if (rim) return
  ctx.save()
  trace(ctx)
  ctx.clip()
  if (peek) {
    // The opening it sits on: a dark crescent along the bottom.
    ctx.save()
    ctx.globalAlpha *= 0.5
    ctx.beginPath()
    ctx.ellipse(x + 0.05, y + 0.3, 0.3, 0.13, 0, 0, TAU)
    ctx.fillStyle = INK
    ctx.fill()
    ctx.restore()
  }
  spiralPath(ctx, x, y - 0.01, 0.3, 2.25, spin)
  ctx.lineWidth = 0.05
  ctx.strokeStyle = SNAIL.swirl
  ctx.stroke()
  ctx.beginPath()
  ctx.ellipse(x - 0.17, y - 0.2, 0.07, 0.04, -0.7, 0, TAU)
  ctx.fillStyle = '#FFFFFF'
  ctx.fill()
  ctx.restore()
  trace(ctx)
  ctx.lineWidth = lw(line)
  ctx.strokeStyle = INK
  ctx.stroke()
}

/** A stomped snail hiding in its shell: resting on its opening, peeking before it wakes, or sliding with two ghosts behind. */
function hiding(ctx: CanvasRenderingContext2D, e: Enemy, age: number, t: number, line: number, rim: Rim) {
  const sliding = e.state === 'slide'
  const spin = sliding ? (t * Math.abs(e.vx)) / 0.36 : 0
  if (sliding && !rim) {
    for (const [dx, alpha] of [
      [-0.5, 0.12],
      [-0.25, 0.25],
    ] as const) {
      ctx.save()
      ctx.globalAlpha *= alpha
      shell(ctx, dx, -0.36, spin - dx * 2, false, line, null)
      ctx.restore()
    }
  }
  shell(ctx, 0, -0.36, spin, !sliding, line, rim)
  if (rim || sliding || age < SHELL_PEEK) return
  // Two eyes peek out of the opening and wiggle: it is about to walk again.
  const wiggle = 0.02 * Math.sin(TAU * 6 * t)
  const rise = smooth(SHELL_PEEK, SHELL_PEEK + 0.3, age) * (1 - smooth(SHELL_WAKE - 0.15, SHELL_WAKE, age))
  for (const x of [0.12, 0.25]) {
    const y = -0.07 - 0.05 * rise
    ctx.beginPath()
    ctx.arc(x + wiggle, y, 0.045, 0, TAU)
    ctx.fillStyle = '#FFFFFF'
    ctx.fill()
    ink(ctx, line * 0.5, null)
    ctx.beginPath()
    ctx.arc(x + wiggle + 0.012, y, 0.022, 0, TAU)
    ctx.fillStyle = INK
    ctx.fill()
  }
}

/** The bee: a round striped body, a face at the front, a stinger, flapping wings and antennae. */
function bee(ctx: CanvasRenderingContext2D, mood: Mood, u: number, t: number, line: number, rim: Rim) {
  const still = mood === 'dazed'
  const flap = still ? 1 : mood === 'asleep' ? 0.85 + 0.15 * Math.sin(TAU * 2 * t) : 0.7 + 0.3 * Math.sin(TAU * 12 * t)
  const wings = (c: CanvasRenderingContext2D, x: number, y: number, a: number) => {
    c.save()
    c.translate(x, y)
    c.rotate(a)
    c.scale(1, flap)
    c.beginPath()
    c.ellipse(0, -0.09, 0.15, 0.1, 0, 0, TAU)
    c.restore()
  }
  // Wings behind the body, the far one first.
  for (const [x, a] of [
    [-0.12, -0.55],
    [-0.02, -0.25],
  ] as const) {
    wings(ctx, x, -0.48, a)
    if (rim) {
      ink(ctx, line * 0.6, rim)
      continue
    }
    ctx.save()
    ctx.globalAlpha *= 0.85
    ctx.fillStyle = '#FFFFFF'
    ctx.fill()
    ctx.globalAlpha *= 0.6 / 0.85
    ink(ctx, line * 0.6, null)
    ctx.restore()
  }
  // The stinger.
  ctx.beginPath()
  ctx.moveTo(-0.27, -0.34)
  ctx.lineTo(-0.4, -0.29)
  ctx.lineTo(-0.27, -0.24)
  ctx.closePath()
  if (rim) ink(ctx, line * 0.5, rim)
  else {
    ctx.fillStyle = INK
    ctx.fill()
  }
  // Antennae.
  for (const [x0, x1, y1] of [
    [0.03, 0.07, -0.68],
    [0.13, 0.22, -0.65],
  ] as const) {
    ctx.beginPath()
    ctx.moveTo(x0, -0.5)
    ctx.quadraticCurveTo(x0 - 0.02, y1 + 0.06, x1, y1)
    ink(ctx, line * 0.55, rim)
    ctx.beginPath()
    ctx.arc(x1, y1, 0.03, 0, TAU)
    if (rim) ink(ctx, line * 0.5, rim)
    else {
      ctx.fillStyle = INK
      ctx.fill()
    }
  }
  const body = (c: CanvasRenderingContext2D) => {
    c.beginPath()
    c.ellipse(0, -0.3, 0.3, 0.23, 0, 0, TAU)
  }
  inkPart(ctx, body, BEE.body, BEE.shade, 0.05, line, rim)
  if (rim) return
  ctx.save()
  body(ctx)
  ctx.clip()
  ctx.fillStyle = INK
  for (const x of [-0.08, -0.2]) {
    ctx.beginPath()
    ctx.moveTo(x - 0.035, -0.6)
    ctx.lineTo(x + 0.035 + 0.04, -0.6)
    ctx.lineTo(x + 0.035 - 0.03, 0)
    ctx.lineTo(x - 0.035 - 0.03, 0)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
  const detail = line * 0.6
  ctx.save()
  ctx.globalAlpha *= 0.7
  ctx.fillStyle = BEE.cheek
  for (const x of [0.06, 0.25]) {
    ctx.beginPath()
    ctx.ellipse(x, -0.22, 0.035, 0.022, 0, 0, TAU)
    ctx.fill()
  }
  ctx.restore()
  eyePair(ctx, [0.09, 0.21], -0.33, 0.045, 0.055, mood, u, t, detail)
  if (mood === 'awake' || mood === 'yawn' || mood === 'worried') brows(ctx, [0.09, 0.21], -0.42, 0.08, line * 0.6, mood === 'worried', null)
  if (mood === 'yawn' && u < 0.85) {
    ctx.beginPath()
    ctx.ellipse(0.15, -0.2, 0.03, 0.02 + 0.03 * arch(u / 0.85), 0, 0, TAU)
    ctx.fillStyle = '#6B3550'
    ctx.fill()
    ink(ctx, detail, null)
  } else if (mood === 'dazed' || mood === 'asleep') {
    ctx.beginPath()
    ctx.ellipse(0.15, -0.21, 0.02, 0.022, 0, 0, TAU)
    ink(ctx, detail, null)
  } else {
    wavePath(ctx, 0.15, -0.21, 0.07, mood === 'worried' ? 0.008 : 0.016, mood === 'worried' ? 3 : 1)
    ink(ctx, detail, null)
  }
}

/** The beaten Big Grumble: a little fluff with two long ears and a happy face, hopping away. */
function bunny(ctx: CanvasRenderingContext2D, e: Enemy, t: number, line: number, rim: Rim) {
  const flop = clamp01(-e.vy / 6)
  ctx.scale(1.25, 1.25)
  line /= 1.25
  for (const [x, a] of [
    [-0.06, -0.35 - 0.3 * flop],
    [0.07, -0.1 - 0.3 * flop],
  ] as const) {
    inkPart(
      ctx,
      (c) => {
        c.save()
        c.translate(x, -0.4)
        c.rotate(a + 0.06 * Math.sin(TAU * 2 * t))
        c.beginPath()
        c.ellipse(0, -0.17, 0.06, 0.18, 0, 0, TAU)
        c.restore()
      },
      GRUMBLE.body,
      GRUMBLE.shade,
      0.03,
      line * 0.7,
      rim,
    )
  }
  blob(ctx, [0, -0.24, 0.22, -0.22, -0.2, 0.08, 0.16, -0.12, 0.1, -0.12, -0.08, 0.09, 0.12, -0.07, 0.09], GRUMBLE.body, GRUMBLE.shade, 0.05, line, rim)
  if (rim) return
  const detail = line * 0.6
  for (const x of [0.02, 0.13]) {
    lidPath(ctx, x, -0.28, 0.035, true)
    ink(ctx, detail, null)
  }
  ctx.beginPath()
  ctx.arc(0.075, -0.22, 0.03, Math.PI * 0.15, Math.PI * 0.85)
  ink(ctx, detail, null)
  ctx.save()
  ctx.globalAlpha *= 0.6
  ctx.fillStyle = '#FF9EB0'
  for (const x of [-0.04, 0.18]) {
    ctx.beginPath()
    ctx.ellipse(x, -0.22, 0.03, 0.018, 0, 0, TAU)
    ctx.fill()
  }
  ctx.restore()
}

/** The happy little fluff a stomped grumble turns into, floating up and fading (u from 0 to 1). */
function spirit(ctx: CanvasRenderingContext2D, u: number, t: number, line: number, rim: Rim) {
  ctx.save()
  ctx.translate(0.1 * Math.sin(TAU * 1.2 * t), -0.35 - 2 * (1 - (1 - u) * (1 - u)))
  ctx.globalAlpha *= 1 - smooth(0.55, 1, u)
  blob(ctx, [0, 0, 0.12, -0.09, -0.06, 0.07, 0.09, -0.06, 0.07, 0, -0.11, 0.07, -0.1, 0.05, 0.06, 0.1, 0.05, 0.06], GRUMBLE.tips, GRUMBLE.body, 0.03, line * 0.8, rim)
  if (!rim) {
    ctx.fillStyle = INK
    for (const x of [-0.045, 0.045]) {
      ctx.beginPath()
      ctx.arc(x, -0.02, 0.018, 0, TAU)
      ctx.fill()
    }
    ctx.beginPath()
    ctx.arc(0, 0.01, 0.035, Math.PI * 0.15, Math.PI * 0.85)
    ink(ctx, line * 0.5, null)
  }
  ctx.restore()
}

/** Swirls circling over a head at (x, y), two turns a second: dizziness, never stars. */
function swirls(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number, line: number, rim: Rim) {
  for (let i = 0; i < 3; i++) {
    const a = TAU * (2 * t + i / 3)
    spiralPath(ctx, x + Math.cos(a) * r, y + Math.sin(a) * r * 0.3, r * 0.22, 1.6, -t * 12 + i)
    ink(ctx, line, rim)
  }
}

/**
 * An enemy, its feet centre at the origin, facing right (the caller mirrors), in its state
 * at sim time t (seconds): asleep with a zzz, yawning, walking or hovering, a shell resting,
 * peeking or sliding, poofing into a happy fluff, knocked over, trapped in a bubble, the
 * Big Grumble dizzy or turned into a bunny. Nothing is drawn once it is gone.
 */
export function drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, t: number, rim: Rim): void {
  if (e.state === 'gone') return
  const age = since(e.stateAt, t)
  const [bw, bh] = boxOf(e.kind, e.state, e.hp)
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (e.state === 'poof' && age >= 0.06) {
    // Burst: seven white puffs fly out, and a happy little fluff floats away.
    const v = clamp01((age - 0.06) / 0.5)
    if (v < 1 && !rim) {
      ctx.fillStyle = '#FFFFFF'
      for (let i = 0; i < 7; i++) {
        const a = (i * TAU) / 7 + 0.4
        const d = 0.15 + 0.45 * (1 - (1 - v) * (1 - v))
        ctx.save()
        ctx.globalAlpha *= 1 - v
        ctx.beginPath()
        ctx.arc(Math.cos(a) * d, -0.35 + Math.sin(a) * d * 0.8, 0.13 * (1 - 0.5 * v), 0, TAU)
        ctx.fill()
        ctx.restore()
      }
    }
    spirit(ctx, clamp01((age - 0.06) / (POOF_FOR - 0.06)), t, LINE, rim)
    ctx.restore()
    return
  }
  // Scale the base art (drawn for its kind's usual box) to this box; ink keeps its width.
  const base = e.kind === 'boss' && e.state !== 'bunny' ? GRUMBLE_BOX : [bw, bh]
  let sx = bw / base[0]!
  let sy = bh / base[1]!
  if (e.kind === 'boss' && e.state === 'dizzy' && e.hp < 3) {
    // Shrinking from the size it was before the stomp, over 0.3 s.
    const [pw, ph] = BOSS_BOX[e.hp]!
    const k = smooth(0, 0.3, age)
    sx = mix(pw, bw, k) / GRUMBLE_BOX[0]
    sy = mix(ph, bh, k) / GRUMBLE_BOX[1]
  }
  let line = LINE / ((sx + sy) / 2)
  const mid = -bh / 2
  let mood: Mood = 'awake'
  let u = 0
  if (e.state === 'asleep') mood = 'asleep'
  else if (e.state === 'yawn') {
    mood = 'yawn'
    u = clamp01(age / YAWN_FOR)
  } else if (e.state === 'knocked' || e.state === 'dizzy') mood = 'dazed'
  else if (e.state === 'trapped') mood = 'worried'
  if (e.state === 'trapped') {
    // Small and worried inside a wobbling bubble that floats it away.
    ctx.translate(0, mid)
    ctx.scale(0.7, 0.7)
    ctx.translate(0, -mid)
    line /= 0.7
  }
  if (e.state === 'knocked') {
    ctx.translate(0, mid)
    ctx.rotate(Math.PI)
    ctx.translate(0, -mid)
  }
  if (e.kind === 'boss' && e.state === 'dizzy') ctx.rotate(6 * DEG * Math.sin(TAU * 2 * t))
  // Breathing asleep, and the yawn's squash then stretch.
  let squash = 1
  if (mood === 'asleep') squash = 1 + 0.04 * Math.sin(TAU * 0.5 * t)
  if (mood === 'yawn') squash = u < 0.4 ? 1 - 0.15 * smooth(0, 0.4, u) : u < 0.75 ? mix(0.85, 1.1, smooth(0.4, 0.75, u)) : mix(1.1, 1, smooth(0.75, 1, u))
  if (e.state === 'poof') squash = 1 - (0.7 * age) / 0.06
  const walking = e.state === 'walk' && e.kind !== 'bee'
  const bob = walking && (e.kind === 'grumble' || e.kind === 'boss') ? -0.03 * Math.abs(Math.sin(TAU * 1.5 * t)) : 0
  ctx.translate(0, bob)
  ctx.scale(sx * (e.state === 'poof' ? 1 + (0.25 * age) / 0.06 : 2 - squash), sy * squash)
  if (e.kind === 'bee' && e.state !== 'bunny') ctx.rotate(clamp01(Math.abs(e.vy) / 2) * Math.sign(e.vy) * 5 * DEG)
  if (e.state === 'bunny') bunny(ctx, e, t, line, rim)
  else if (e.kind === 'snail' && (e.state === 'shell' || e.state === 'slide')) hiding(ctx, e, age, t, line, rim)
  else if (e.kind === 'snail') snail(ctx, mood, u, walking, t, line, rim)
  else if (e.kind === 'bee') bee(ctx, mood, u, t, line, rim)
  else {
    grumble(ctx, mood, u, walking, t, line, e.kind === 'boss', rim)
    if (e.kind === 'boss') sockHat(ctx, line, rim)
  }
  if (mood === 'asleep') snore(ctx, e.kind === 'snail' ? 0.45 : e.kind === 'bee' ? 0.3 : 0.25, e.kind === 'snail' ? -0.85 : -0.75, t, line * 0.7, rim)
  if (e.kind === 'boss' && e.state === 'dizzy') {
    swirls(ctx, 0, -1.22, 0.3, t, line * 0.7, rim)
    if (age < 0.1 && !rim) {
      // The hit's white flash.
      ctx.save()
      ctx.globalAlpha *= 0.6
      ctx.beginPath()
      ctx.arc(0, -0.4, 0.45, 0, TAU)
      ctx.fillStyle = '#FFFFFF'
      ctx.fill()
      ctx.restore()
    }
  }
  ctx.restore()
  if (e.state === 'trapped' && !rim) {
    const wob = 0.04 * Math.sin(TAU * 2 * t)
    const r = 0.55 * Math.max(bw / GRUMBLE_BOX[0], bh / GRUMBLE_BOX[1])
    ctx.save()
    ctx.translate(0, mid)
    ctx.scale(1 + wob, 1 - wob)
    bubbleBall(ctx, r, t)
    ctx.restore()
  }
}

// ---------------------------------------------------------------------------------------
// Kittens

/**
 * hidden: only its eyes, glowing in the bed's dark doorway (the origin on the doorway's
 * floor). sit: sitting, tail curled, waving now and then. hop: mid-hop, facing right.
 * hug: held up in Pia's arms, reaching for her (to its left); the origin is where her arms
 * hold it, its middle (see hugAt). dance: the picnic. Otherwise the origin is its feet centre.
 */
export type KittenPose = 'hidden' | 'sit' | 'hop' | 'hug' | 'dance'

/** A patch of a kitten's coat: (x, y, r) and its colour, clipped to the head or the body. */
type Patch = readonly [number, number, number, string]

/** A kitten's coat: fur, the light muzzle and belly, its ears (left, right), paws, tail, eyes and patches. */
interface Coat {
  fur: string
  light: string
  ears: readonly [string, string]
  paws: string
  tail: string
  tip: string
  /** The iris; INK eyes have no separate pupil. */
  eye: string
  whiskers: string
  /** Ginger tabby stripes in this colour, or none. */
  stripes: string | null
  head: readonly Patch[]
  body: readonly Patch[]
}

const WHITE = '#FFFDF8'
const GREY = '#B8B6C8'
const ORANGE = '#FFA24C'
const CHARCOAL = '#4A4458'

/** Five plain kittens wearing nothing, told apart by their coats only. */
const COATS: Record<Kitten, Coat> = {
  sunny: {
    fur: '#FFB054',
    light: '#FFF1DC',
    ears: ['#FFB054', '#FFB054'],
    paws: '#FFF1DC',
    tail: '#FFB054',
    tip: '#E88A2E',
    eye: INK,
    whiskers: INK,
    stripes: '#E88A2E',
    head: [],
    body: [[0, -0.12, 0.12, '#FFF1DC']],
  },
  coco: {
    fur: '#A8735A',
    light: '#F5DCC8',
    ears: ['#7A4E3E', '#7A4E3E'],
    paws: '#7A4E3E',
    tail: '#A8735A',
    tip: '#7A4E3E',
    eye: INK,
    whiskers: INK,
    stripes: null,
    head: [],
    body: [[0, -0.12, 0.12, '#F5DCC8']],
  },
  mochi: {
    fur: WHITE,
    light: WHITE,
    ears: [GREY, WHITE],
    paws: WHITE,
    tail: GREY,
    tip: GREY,
    eye: INK,
    whiskers: INK,
    stripes: null,
    head: [[-0.19, -0.7, 0.13, GREY]],
    body: [[0.16, -0.26, 0.12, GREY]],
  },
  lulu: {
    fur: WHITE,
    light: WHITE,
    ears: [CHARCOAL, ORANGE],
    paws: WHITE,
    tail: ORANGE,
    tip: CHARCOAL,
    eye: INK,
    whiskers: INK,
    stripes: null,
    head: [
      [0.2, -0.68, 0.14, ORANGE],
      [-0.21, -0.71, 0.12, CHARCOAL],
    ],
    body: [
      [-0.17, -0.25, 0.12, ORANGE],
      [0.19, -0.07, 0.09, CHARCOAL],
    ],
  },
  pepper: {
    fur: CHARCOAL,
    light: '#FFFFFF',
    ears: [CHARCOAL, CHARCOAL],
    paws: '#FFFFFF',
    tail: CHARCOAL,
    tip: CHARCOAL,
    eye: '#FFE066',
    whiskers: '#FFFFFF',
    stripes: null,
    head: [],
    body: [[0, -0.13, 0.13, '#FFFFFF']],
  },
}

const KITTEN = { innerEar: '#FFC9D9', nose: '#FF8FA3', blush: '#FF9EB0', glow: '#FFF3B0', mouth: '#B23A5E' } as const

/**
 * One kitten part: `trace` filled with fur, its patches (and tabby stripes) clipped
 * inside, a shade crescent along the bottom (the part minus itself lifted by k, darkened
 * a little, so patches shade the same way), then the ink. With a rim, only the rim.
 */
function furPart(
  ctx: CanvasRenderingContext2D,
  trace: (c: CanvasRenderingContext2D) => void,
  fur: string,
  patches: readonly Patch[],
  stripes: (() => void) | null,
  k: number,
  line: number,
  rim: Rim,
) {
  if (rim) {
    trace(ctx)
    ink(ctx, line, rim)
    return
  }
  trace(ctx)
  ctx.fillStyle = fur
  ctx.fill()
  ctx.save()
  ctx.clip()
  for (const [x, y, r, c] of patches) {
    ctx.beginPath()
    ctx.arc(x, y, r, 0, TAU)
    ctx.fillStyle = c
    ctx.fill()
  }
  if (stripes) stripes()
  ctx.translate(0, -k)
  trace(ctx)
  ctx.translate(0, k)
  ctx.rect(-3, -3, 6, 6)
  ctx.globalAlpha *= 0.14
  ctx.fillStyle = INK
  ctx.fill('evenodd')
  ctx.restore()
  trace(ctx)
  ctx.lineWidth = lw(line)
  ctx.strokeStyle = INK
  ctx.stroke()
}

/** A kitten's ear standing on (x, y), tilted by a (radians, + outward to the right). */
function kittenEar(ctx: CanvasRenderingContext2D, x: number, y: number, a: number, colour: string, rim: Rim) {
  const trace = (c: CanvasRenderingContext2D, s: number, lift: number) => {
    const ux = Math.sin(a)
    const uy = -Math.cos(a)
    const bx = x + ux * lift
    const by = y + uy * lift
    const b = 0.15 * s
    const h = 0.16 * s
    c.beginPath()
    c.moveTo(bx, by)
    c.arcTo(bx - (uy * b) / 2, by + (ux * b) / 2, bx + ux * h, by + uy * h, b * 0.15)
    c.arcTo(bx + ux * h, by + uy * h, bx + (uy * b) / 2, by - (ux * b) / 2, b * 0.24)
    c.arcTo(bx + (uy * b) / 2, by - (ux * b) / 2, bx - (uy * b) / 2, by + (ux * b) / 2, b * 0.15)
    c.closePath()
  }
  flatPart(ctx, (c) => trace(c, 1, 0), colour, LINE_DETAIL, rim)
  if (rim) return
  trace(ctx, 0.5, 0.035)
  ctx.fillStyle = KITTEN.innerEar
  ctx.fill()
}

/** A kitten, told apart from the others only by its coat. */
export function drawKitten(ctx: CanvasRenderingContext2D, kitten: Kitten, pose: KittenPose, t: number, rim: Rim): void {
  const coat = COATS[kitten]
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (pose === 'hidden') {
    // Only two eyes glowing in the dark doorway, blinking every 2.5 s, glancing about.
    if (!rim) {
      const blink = t % 2.5 < 0.14 ? 0.15 : 1
      const glance = 0.018 * Math.sin(TAU * 0.23 * t)
      for (const x of [-0.12, 0.12]) {
        ctx.save()
        ctx.globalAlpha *= 0.22
        ctx.beginPath()
        ctx.arc(x, -0.5, 0.14, 0, TAU)
        ctx.fillStyle = KITTEN.glow
        ctx.fill()
        ctx.restore()
        ctx.beginPath()
        ctx.ellipse(x, -0.5, 0.078, 0.078 * blink, 0, 0, TAU)
        ctx.fillStyle = KITTEN.glow
        ctx.fill()
        if (blink === 1) {
          ctx.beginPath()
          ctx.arc(x + glance, -0.5, 0.045, 0, TAU)
          ctx.fillStyle = INK
          ctx.fill()
          ctx.beginPath()
          ctx.arc(x + glance - 0.016, -0.517, 0.015, 0, TAU)
          ctx.fillStyle = '#FFFFFF'
          ctx.fill()
        }
      }
    }
    ctx.restore()
    return
  }
  const detail = !rim && pen.px >= 70
  // The pose: lift, stretch, where the face turns, the paws, the tail, the eyes.
  let rise = 0
  let sy = 1
  let face = 0
  let happy = false
  let open = false
  let tail: 'curl' | 'stream' | 'hang' = 'curl'
  let wag = 0
  let hind = false
  // Each front paw: [x, y] of its end, and whether it is raised off the ground.
  const paws: [number, number, boolean][] = [
    [-0.075, -0.035, false],
    [0.075, -0.035, false],
  ]
  if (pose === 'sit') {
    // Every 3.2 s one paw comes up and waves for a second.
    const w = t % 3.2
    const lift = smooth(0, 0.2, w) * (1 - smooth(0.95, 1.15, w))
    if (lift > 0.01) paws[1] = [0.075 + 0.17 * lift + 0.035 * Math.sin(TAU * 3 * w) * lift, -0.035 - 0.33 * lift, true]
    happy = lift > 0.5
  } else if (pose === 'dance') {
    const beat = (t * 2) % 1
    rise = 0.12 * arch(beat)
    sy = 1 + 0.05 * arch(beat) - 0.05 * (beat < 0.12 ? 1 - beat / 0.12 : 0)
    const side = Math.floor(t * 2) % 2
    paws[side] = [(side ? 1 : -1) * 0.2, -0.38, true]
    wag = 0.5 * Math.sin(TAU * 2 * t)
    happy = true
    open = true
  } else if (pose === 'hop') {
    sy = 1.08
    face = 0.05
    rise = 0.06
    hind = true
    tail = 'stream'
    paws[0] = [0.06, -0.32, true]
    paws[1] = [0.2, -0.27, true]
    open = true
  } else {
    // In her arms: held at its middle, paws reaching up to her, eyes shut with joy.
    face = -0.04
    hind = true
    tail = 'hang'
    happy = true
    open = Math.sin(TAU * 0.7 * t) > 0
    paws[0] = [-0.2, -0.32, true]
    paws[1] = [-0.06, -0.36, true]
  }
  if (pose === 'hug') ctx.translate(0, 0.14 + 0.01 * Math.sin(TAU * 1.2 * t))
  ctx.translate(0, -rise)
  ctx.scale(2 - sy, sy)

  // The tail, behind the body: curled round the front paws, streaming back, or hanging down.
  ctx.beginPath()
  if (tail === 'curl') {
    ctx.moveTo(0.12, -0.12)
    ctx.bezierCurveTo(0.34 + wag * 0.1, -0.16 - wag * 0.2, 0.34, 0.02, 0.14, 0.0)
    ctx.lineTo(0.02, 0.0)
  } else if (tail === 'stream') {
    ctx.moveTo(-0.12, -0.1)
    ctx.bezierCurveTo(-0.3, -0.12, -0.36, -0.28, -0.3, -0.4)
  } else {
    ctx.moveTo(0.1, -0.06)
    ctx.bezierCurveTo(0.22, 0.0, 0.24, 0.12, 0.16, 0.22)
  }
  tube(ctx, 0.055, coat.tail, LINE_DETAIL, rim)
  if (!rim && coat.tip !== coat.tail) {
    ctx.beginPath()
    if (tail === 'curl') {
      ctx.moveTo(0.09, 0.0)
      ctx.lineTo(0.02, 0.0)
    } else {
      // A round dab at the tail's end.
      const [x, y] = tail === 'stream' ? [-0.3, -0.4] : [0.16, 0.22]
      ctx.arc(x, y, 0.001, 0, TAU)
    }
    ctx.lineWidth = 0.055
    ctx.strokeStyle = coat.tip
    ctx.stroke()
  }
  if (hind) {
    // Hind legs: stretched under it mid-hop, dangling in her arms.
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(side * 0.09, -0.08)
      ctx.lineTo(side * 0.11, 0.02)
      tube(ctx, 0.07, coat.fur, LINE_DETAIL, rim)
      flatPart(ctx, (c) => (c.beginPath(), c.ellipse(side * 0.11, 0.035, 0.05, 0.035, 0, 0, TAU)), coat.paws, LINE_DETAIL, rim)
    }
  }
  furPart(
    ctx,
    (c) => {
      c.beginPath()
      c.moveTo(-0.21, -0.01)
      c.quadraticCurveTo(-0.235, -0.2, -0.13, -0.34)
      c.quadraticCurveTo(0, -0.43, 0.13, -0.34)
      c.quadraticCurveTo(0.235, -0.2, 0.21, -0.01)
      c.quadraticCurveTo(0, 0.02, -0.21, -0.01)
      c.closePath()
    },
    coat.fur,
    coat.body,
    coat.stripes
      ? () => {
          ctx.strokeStyle = coat.stripes!
          ctx.lineWidth = 0.035
          for (const side of [-1, 1]) {
            for (const y of [-0.26, -0.16]) {
              ctx.beginPath()
              ctx.moveTo(side * 0.24, y)
              ctx.quadraticCurveTo(side * 0.17, y + 0.02, side * 0.15, y + 0.06)
              ctx.stroke()
            }
          }
        }
      : null,
    0.05,
    LINE,
    rim,
  )
  // Front paws: resting at the bottom, or raised on a foreleg.
  for (const [x, y, raised] of paws) {
    if (raised) {
      ctx.beginPath()
      ctx.moveTo(Math.sign(x) * 0.08, -0.24)
      ctx.lineTo(x, y)
      tube(ctx, 0.07, coat.fur, LINE_DETAIL, rim)
    }
    flatPart(ctx, (c) => (c.beginPath(), c.ellipse(x, y, raised ? 0.05 : 0.065, raised ? 0.05 : 0.042, 0, 0, TAU)), coat.paws, LINE_DETAIL, rim)
  }

  // The head: ears behind it, then the face.
  const hx = face
  const hy = -0.55
  kittenEar(ctx, hx - 0.15, -0.71, -0.32, coat.ears[0], rim)
  kittenEar(ctx, hx + 0.15, -0.71, 0.32, coat.ears[1], rim)
  furPart(
    ctx,
    (c) => {
      c.beginPath()
      c.ellipse(hx, hy, 0.26, 0.22, 0, 0, TAU)
    },
    coat.fur,
    coat.head.map(([x, y, r, c]) => [x + hx, y, r, c] as const),
    coat.stripes
      ? () => {
          ctx.strokeStyle = coat.stripes!
          ctx.lineWidth = 0.03
          for (const dx of [-0.06, 0, 0.06]) {
            ctx.beginPath()
            ctx.moveTo(hx + dx, -0.78)
            ctx.lineTo(hx + dx * 1.15, -0.69)
            ctx.stroke()
          }
          for (const side of [-1, 1]) {
            ctx.beginPath()
            ctx.moveTo(hx + side * 0.27, -0.56)
            ctx.lineTo(hx + side * 0.2, -0.54)
            ctx.stroke()
          }
        }
      : null,
    0.05,
    LINE,
    rim,
  )
  if (rim) {
    ctx.restore()
    return
  }
  const fx = hx + face * 0.6
  if (coat.light !== coat.fur) {
    // The muzzle: two light puffs.
    ctx.fillStyle = coat.light
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.ellipse(fx + side * 0.045, -0.465, 0.065, 0.048, 0, 0, TAU)
      ctx.fill()
    }
  }
  ctx.save()
  ctx.globalAlpha *= 0.5
  ctx.fillStyle = KITTEN.blush
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.ellipse(fx + side * 0.165, -0.49, 0.04, 0.022, 0, 0, TAU)
    ctx.fill()
  }
  ctx.restore()
  for (const side of [-1, 1]) {
    const ex = fx + side * 0.105
    if (happy) {
      // Shut with joy; on a dark coat the lids are light, like the whiskers.
      lidPath(ctx, ex, -0.56, 0.06, true)
      ctx.lineWidth = lw(LINE_DETAIL)
      ctx.strokeStyle = coat.whiskers
      ctx.stroke()
      continue
    }
    ctx.beginPath()
    ctx.arc(ex, -0.565, 0.07, 0, TAU)
    ctx.fillStyle = coat.eye
    ctx.fill()
    if (coat.eye !== INK) {
      ink(ctx, LINE_DETAIL * 0.6, null)
      ctx.beginPath()
      ctx.arc(ex, -0.565, 0.04, 0, TAU)
      ctx.fillStyle = INK
      ctx.fill()
    }
    ctx.fillStyle = '#FFFFFF'
    ctx.beginPath()
    ctx.arc(ex - 0.024, -0.59, 0.025, 0, TAU)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(ex + 0.022, -0.54, 0.011, 0, TAU)
    ctx.fill()
  }
  ctx.beginPath()
  ctx.moveTo(fx - 0.022, -0.505)
  ctx.lineTo(fx + 0.022, -0.505)
  ctx.lineTo(fx, -0.482)
  ctx.closePath()
  ctx.fillStyle = KITTEN.nose
  ctx.fill()
  if (open) {
    ctx.beginPath()
    ctx.moveTo(fx - 0.035, -0.47)
    ctx.quadraticCurveTo(fx, -0.46, fx + 0.035, -0.47)
    ctx.quadraticCurveTo(fx, -0.405, fx - 0.035, -0.47)
    ctx.fillStyle = KITTEN.mouth
    ctx.fill()
    ink(ctx, LINE_DETAIL * 0.6, null)
  } else {
    ctx.beginPath()
    ctx.arc(fx - 0.02, -0.476, 0.02, Math.PI * 0.1, Math.PI * 0.95)
    ctx.moveTo(fx + 0.04, -0.47)
    ctx.arc(fx + 0.02, -0.476, 0.02, Math.PI * 0.05, Math.PI * 0.9)
    ink(ctx, LINE_DETAIL * 0.7, null)
  }
  if (detail) {
    for (const side of [-1, 1]) {
      for (const [y0, y1] of [
        [-0.49, -0.51],
        [-0.465, -0.45],
      ] as const) {
        ctx.beginPath()
        ctx.moveTo(fx + side * 0.17, y0)
        ctx.lineTo(fx + side * 0.29, y1)
        ctx.lineWidth = lw(LINE_DETAIL * 0.5)
        ctx.strokeStyle = coat.whiskers
        ctx.stroke()
      }
    }
  }
  ctx.restore()
}
