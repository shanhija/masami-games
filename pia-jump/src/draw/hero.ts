import { BALL_BLINK, BIG_W, RUN, SMALL_W, STEP, WALK, since, type Form, type Sim } from '../game/model'
import { COLOR, INK, LINE, LINE_DETAIL, SHADE_CHARACTER, blob, bubbleBall, heartPath, inkPart, lw, pen, type Rim } from './look'
import { DEG, TAU, arch, clamp01, flatPart, ink, lidPath, mix, smooth, spiralPath, tube, wavePath } from './parts'

/**
 * Pia: one figure painted from two records, a rig (every size and offset, one per size, so
 * growing is a lerp between them) and a pose (angles, squash and face, read from the sim).
 * Her recognition cues are the pink cat-ear headband, the cloud of dark curls, warm skin,
 * big eyes with blush and pastels; everything else (the violet dress with its white collar
 * and scalloped hem, grape Mary Janes, a solid pink tail with a white tip) is her own.
 * +x is the side she faces, -y is up.
 */

/** Her colours. The hair never changes colour; the dress is violet, or blue with white dots in the bubble form. */
const PIA = {
  skin: '#E3A47A',
  skinShade: '#C9865E',
  blush: '#FF8C9E',
  hair: '#3A2329',
  hairShade: '#2A181E',
  curl: '#6E4550',
  pink: '#FF6FAE',
  innerEar: '#FFD3E6',
  tip: '#FFFFFF',
  collar: '#FFFFFF',
  sock: '#FFFFFF',
  shoe: '#7A4CC2',
  stick: '#FF9CCB',
  ring: '#FF5FA2',
  mouth: '#B23A5E',
  tongue: '#FF8FA3',
} as const

/** The dress for a form: violet for small and big, blue with dots and the wand for the bubble form. */
interface Look {
  dress: string
  shade: string
  bubble: boolean
}
/** Small and big. */
const VIOLET: Look = { dress: '#A98BFF', shade: '#8C6CEB', bubble: false }
/** The bubble form. */
const BLUE: Look = { dress: '#4F8DF5', shade: '#3A70D6', bubble: true }

/** The rainbow ball's halo, outer to inner: how far each band reaches past her ink, and its colour. */
const HALO = [
  [0.15, '#FF6B6B'],
  [0.11, '#FFE066'],
  [0.07, '#74C0FC'],
] as const

/** Every size and offset of her figure for one size; face and hair are measured from the head centre. */
interface Rig {
  shoeRx: number
  shoeRy: number
  /** The shoes stand at x = +-footX. */
  footX: number
  legW: number
  hipX: number
  hipY: number
  /** A white sock band this tall above each shoe (big only). */
  sock: number
  hemY: number
  hemW: number
  shoulderY: number
  shoulderW: number
  scallop: number
  scallops: number
  collarR: number
  collarX: number
  sleeveR: number
  sleeveX: number
  sleeveY: number
  armLen: number
  armW: number
  tailX: number
  tailY: number
  tailLen: number
  tailW: number
  /** The tail's last `tip` is white. */
  tip: number
  headR: number
  headX: number
  headY: number
  /** Hair circles as (x, y, r) triples: the back cloud and the fringe. */
  hair: number[]
  fringe: number[]
  /** The headband's radius and width; the ears stand on it. */
  bandR: number
  bandW: number
  earBase: number
  earH: number
  eyeRx: number
  eyeRy: number
  eyeX0: number
  eyeX1: number
  eyeY: number
  blushRx: number
  blushRy: number
  blushX0: number
  blushX1: number
  blushY: number
  mouthR: number
  mouthX: number
  mouthY: number
  /** Her feet's travel relative to small (pose offsets are written for small). */
  stride: number
  /** Ground covered by one stride cycle. */
  cycle: number
  /** The wand: stick length and ring radius. */
  stick: number
  ringR: number
}

/** Small Pia: chibi, head and hair over half her height. */
const SMALL: Rig = {
  shoeRx: 0.085,
  shoeRy: 0.05,
  footX: 0.1,
  legW: 0.07,
  hipX: 0.09,
  hipY: -0.17,
  sock: 0,
  hemY: -0.15,
  hemW: 0.29,
  shoulderY: -0.45,
  shoulderW: 0.14,
  scallop: 0.03,
  scallops: 3,
  collarR: 0.075,
  collarX: 0.05,
  sleeveR: 0.065,
  sleeveX: 0.15,
  sleeveY: -0.42,
  armLen: 0.17,
  armW: 0.065,
  tailX: -0.2,
  tailY: -0.24,
  tailLen: 0.36,
  tailW: 0.075,
  tip: 0.06,
  headR: 0.26,
  headX: 0.02,
  headY: -0.705,
  // The last two are the big rig's shoulder curls, tucked inside the cloud while she is small.
  hair: [-0.18, -0.12, 0.14, -0.26, 0.02, 0.13, -0.23, 0.16, 0.11, -0.07, -0.17, 0.12, 0.09, -0.17, 0.12, -0.23, 0.16, 0.11, -0.26, 0.02, 0.13],
  fringe: [-0.03, -0.2, 0.085, 0.09, -0.2, 0.08, 0.19, -0.13, 0.07],
  bandR: 0.28,
  bandW: 0.065,
  earBase: 0.19,
  earH: 0.18,
  eyeRx: 0.04,
  eyeRy: 0.06,
  eyeX0: 0.035,
  eyeX1: 0.175,
  eyeY: 0.03,
  blushRx: 0.045,
  blushRy: 0.025,
  blushX0: -0.03,
  blushX1: 0.225,
  blushY: 0.1,
  mouthR: 0.032,
  mouthX: 0.115,
  mouthY: 0.135,
  stride: 1,
  cycle: 0.9,
  stick: 0.2,
  ringR: 0.075,
}

/** Big Pia (and the bubble form): two tiles tall, the head and hair a bit over a third of her. */
const BIG: Rig = {
  shoeRx: 0.11,
  shoeRy: 0.065,
  footX: 0.13,
  legW: 0.105,
  hipX: 0.11,
  hipY: -0.56,
  sock: 0.06,
  hemY: -0.5,
  hemW: 0.38,
  shoulderY: -1.1,
  shoulderW: 0.17,
  scallop: 0.04,
  scallops: 4,
  collarR: 0.095,
  collarX: 0.065,
  sleeveR: 0.085,
  sleeveX: 0.19,
  sleeveY: -1.06,
  armLen: 0.42,
  armW: 0.085,
  tailX: -0.26,
  tailY: -0.62,
  tailLen: 0.52,
  tailW: 0.09,
  tip: 0.08,
  headR: 0.33,
  headX: 0.03,
  headY: -1.44,
  hair: [-0.229, -0.152, 0.178, -0.33, 0.025, 0.165, -0.292, 0.203, 0.14, -0.089, -0.216, 0.152, 0.114, -0.216, 0.152, -0.3, 0.28, 0.13, -0.33, 0.15, 0.14],
  fringe: [-0.038, -0.254, 0.108, 0.114, -0.254, 0.102, 0.241, -0.165, 0.089],
  bandR: 0.37,
  bandW: 0.08,
  earBase: 0.23,
  earH: 0.22,
  eyeRx: 0.048,
  eyeRy: 0.072,
  eyeX0: 0.045,
  eyeX1: 0.22,
  eyeY: 0.04,
  blushRx: 0.055,
  blushRy: 0.03,
  blushX0: -0.04,
  blushX1: 0.285,
  blushY: 0.13,
  mouthR: 0.04,
  mouthX: 0.14,
  mouthY: 0.175,
  stride: 1.6,
  cycle: 1.4,
  stick: 0.28,
  ringR: 0.095,
}

/** The rig k of the way from a to b (k may overshoot 1 for the grow's bounce). */
function mixRig(a: Rig, b: Rig, k: number): Rig {
  const out: Record<string, number | number[]> = {}
  for (const key of Object.keys(a) as (keyof Rig)[]) {
    const x = a[key]
    const y = b[key]
    out[key] = typeof x === 'number' ? mix(x, y as number, k) : x.map((v, i) => mix(v, (y as number[])[i]!, k))
  }
  return out as unknown as Rig
}

/** Growing takes this long (an elastic tween with an overshoot to 1.08), shrinking this long (ease-in). */
const GROW_FOR = 0.45
const SHRINK_FOR = 0.3
/** Her forms in the order she grows through them: a change up this order grows her, a change down shrinks her. */
const GROWTH: Record<Form, number> = { small: 0, big: 1, bubble: 2 }

/** Her eyes: open with shines, a blink, '^ ^', wide rings, dizzy spirals, '> <'. */
type Eyes = 'open' | 'closed' | 'happy' | 'wide' | 'spiral' | 'squeeze'
/** Her mouth: a smile, an open D with a tongue, a small 'o', a wobbly line. */
type Mouth = 'smile' | 'open' | 'o' | 'wobbly'

/** What her state does to the figure this frame. Lengths are in small-Pia tiles; the rig's stride scales the ones that move her feet. */
interface Pose {
  /** Lean in degrees about her feet, + forward. */
  tilt: number
  /** Squash: her y scale; the x scale is 2 - sy. */
  sy: number
  /** The whole figure lifted (a hop) and moved forward (onto the pole). */
  rise: number
  shift: number
  /** Everything above the legs moved down by this. */
  bob: number
  /** The feet's offsets from where they stand at rest. */
  backX: number
  backY: number
  frontX: number
  frontY: number
  /** Arms in degrees from hanging down, + toward her front; each reach scales its length. */
  armBack: number
  armFront: number
  reachBack: number
  reachFront: number
  /** Tail in degrees above straight back; ears in degrees, + forward; the hanging curls moved down by this. */
  tail: number
  ears: number
  curls: number
  /** The hem's width scale and how far it is lifted. */
  hem: number
  hemUp: number
  eyes: Eyes
  mouth: Mouth
  blush: number
  /** The wand at her mouth instead of held up. */
  blow: boolean
  /** Sitting with her knees pulled up: the legs come in front of the skirt. */
  sit: boolean
}

/** Her size and dress this frame: the form's own, or the grow or shrink tween between two forms. */
function build(s: Sim, t: number): { g: Rig; look: Look } {
  const h = s.hero
  const look = h.form === 'bubble' ? BLUE : VIOLET
  const age = since(h.changedAt, t)
  const flicker = Math.floor(age / 0.06) % 2 === 0
  if (GROWTH[h.form] > GROWTH[h.was] && age < GROW_FOR) {
    const u = age / GROW_FOR
    // An ease-out-back whose overshoot is exactly 8%.
    const v = 1 - u
    const k = 1 - 2.5 * v * v * v + 1.5 * v * v
    // From small she grows (the wand also flickers the violet dress into the blue one); from big the
    // wand keeps her size, bounces and flickers the dress.
    if (h.was === 'small') return { g: mixRig(SMALL, BIG, k), look: h.form === 'bubble' && flicker ? VIOLET : look }
    return { g: mixRig(SMALL, BIG, 1 + 0.6 * (k - 1)), look: flicker ? VIOLET : BLUE }
  }
  if (GROWTH[h.form] < GROWTH[h.was] && age < SHRINK_FOR) {
    const u = age / SHRINK_FOR
    if (h.form === 'small') return { g: mixRig(BIG, SMALL, u * u), look }
    return { g: BIG, look: flicker ? BLUE : VIOLET }
  }
  return { g: h.form === 'small' ? SMALL : BIG, look }
}

/** Where the kitten she hugs is held, relative to her feet, facing right: the point her arms meet at chest height, which is the origin of drawKitten's 'hug' pose. The stage puts the kitten there in the found phase. */
export function hugAt(form: Form): readonly [number, number] {
  return form === 'small' ? [0.44, -0.36] : [0.55, -0.92]
}

/** The arm angle and reach that put the hand of the arm on `side` at (x, y), the reach held to at most `most`. */
function aim(g: Rig, side: -1 | 1, bob: number, x: number, y: number, most: number): [number, number] {
  const dx = x - side * g.sleeveX
  const dy = y - (g.sleeveY + bob * g.stride)
  return [Math.atan2(dx, dy) / DEG, Math.min(most, Math.hypot(dx, dy) / g.armLen)]
}

/** Her pose from the sim: the phase first, then on the ground or in the air, then the moments that pass (take-off, landing, bonk, hurt, blow). */
function pose(s: Sim, t: number, g: Rig, look: Look): Pose {
  const h = s.hero
  const p: Pose = {
    tilt: 0,
    sy: 1 + 0.02 * Math.sin((TAU * t) / 1.6),
    rise: 0,
    shift: 0,
    bob: 0,
    backX: 0,
    backY: 0,
    frontX: 0,
    frontY: 0,
    armBack: -10,
    armFront: 10,
    reachBack: 1,
    reachFront: 1,
    tail: 35 + 10 * Math.sin(TAU * 0.5 * t),
    ears: 0,
    curls: 0,
    hem: 1,
    hemUp: 0,
    eyes: t % 3.7 < 0.12 ? 'closed' : 'open',
    mouth: 'smile',
    blush: 0.55,
    blow: false,
    sit: false,
  }
  const inPhase = since(s.phaseAt, t)
  if (s.phase === 'rescue') {
    // Curled up in the bubble: knees pulled up in front of her skirt, arms round them, tail curled.
    Object.assign(p, { tilt: -10, sy: 0.96, bob: 0.08, frontX: 0.06, frontY: -0.16, backX: 0.1, backY: -0.14, tail: 60, hem: 1.1, eyes: 'happy', mouth: 'smile', sit: true })
    const knee = g.hipY + 0.02 * g.stride
    ;[p.armFront, p.reachFront] = aim(g, 1, p.bob, 0.2 * g.stride, knee - 0.02 * g.stride, 1.5)
    ;[p.armBack, p.reachBack] = aim(g, -1, p.bob, 0.16 * g.stride, knee - 0.05 * g.stride, 1.5)
    return p
  }
  if (s.phase === 'pole') {
    // Both hands on the pole just in front of her, feet together, sliding down.
    const pole = (h.form === 'small' ? SMALL_W : BIG_W) / 2 + 0.11
    const hand = -0.6 * h.h
    p.shift = 0.03 * g.stride
    ;[p.armFront, p.reachFront] = aim(g, 1, 0, pole - p.shift - 0.03, hand, 1.7)
    ;[p.armBack, p.reachBack] = aim(g, -1, 0, pole - p.shift - 0.05, hand + 0.16 * g.stride, 1.7)
    Object.assign(p, { frontX: 0.05, backX: 0.08, frontY: -0.02, tail: 45, hem: 1.06, eyes: 'happy', mouth: 'open' })
    return p
  }
  if (s.phase === 'found' || s.phase === 'done') {
    const wag = 25 * Math.sin(TAU * 4 * t)
    const [kx, ky] = hugAt(h.form)
    const [front, frontReach] = aim(g, 1, 0, kx - 0.08 * g.stride, ky + 0.02, 1.6)
    const [back, backReach] = aim(g, -1, 0, kx + 0.02, ky - 0.06, 1.6)
    Object.assign(p, { tail: 30 + wag, eyes: 'happy', blush: 0.8 })
    if (s.phase === 'found' && inPhase < 0.7) {
      // Two hops for joy, arms up.
      const u = (inPhase % 0.35) / 0.35
      Object.assign(p, { rise: 0.45 * arch(u), sy: 1 + 0.06 * arch(u), armFront: 132, armBack: -160, frontY: -0.05 * arch(u), backY: -0.03 * arch(u), mouth: 'open', hem: 1.08 })
      return p
    }
    // Then the hug: her hands meet round the kitten at chest height (the arms come down over 0.1 s).
    const k = s.phase === 'found' ? smooth(0.7, 0.8, inPhase) : 1
    p.armFront = mix(132, front, k)
    p.armBack = mix(-160, back, k)
    p.reachFront = mix(1, frontReach, k)
    p.reachBack = mix(1, backReach, k)
    return p
  }
  // Play, the freeze, and the walk home.
  const speed = Math.abs(h.vx)
  if (!h.grounded) {
    // Rising, at the top, falling: blended by vertical speed so the arc flows.
    const up = 1 - smooth(-6, -1, h.vy)
    const down = smooth(1, 6, h.vy)
    const top = 1 - up - down
    const flap = 10 * Math.sin(TAU * 6 * t)
    p.sy = 1
    p.tilt = (4 * speed) / RUN
    p.armFront = up * 130 + top * 112 + down * (126 + flap)
    p.armBack = -(up * 150 + top * 120 + down * (140 - flap))
    p.frontX = up * 0.05 + top * 0.02 + down * 0.03
    p.frontY = up * -0.1 + top * -0.06 + down * 0.02
    p.backX = up * -0.03 - top * 0.02 - down * 0.03
    p.backY = top * -0.06 + down * 0.02
    p.hem = up * 0.9 + top * 1.05 + down * 1.18
    p.hemUp = down * 0.04
    p.tail = up * -30 + down * 40
    p.ears = up * 10 - down * 10
    p.curls = up * 0.04 - down * 0.05
    p.mouth = down > 0.5 ? 'o' : 'open'
    if (down > 0.5) p.eyes = 'wide'
    // The take-off stretch.
    const off = since(h.jumpedAt, t)
    if (off < 0.08) p.sy = 1.15 - (0.15 * off) / 0.08
  } else if (h.skidding) {
    // Braking: feet planted toward where she slides, body and arms thrown the other way.
    // The sim turns her to face the push, so she usually slides backward (m = -1).
    const m = h.vx * h.facing >= 0 ? 1 : -1
    Object.assign(p, { tilt: -14 * m, sy: 0.97, eyes: 'wide', mouth: 'o', tail: 55, ears: -10 * m })
    if (m > 0) Object.assign(p, { frontX: 0.18, backX: -0.03, armFront: -55, armBack: -80 })
    else Object.assign(p, { backX: -0.18, frontX: 0.03, armFront: 75, armBack: 55 })
  } else if (speed >= 0.3) {
    // Walking into running: the stride's phase is the ground she has covered.
    const run = smooth(WALK, RUN, speed)
    const phase = (TAU * h.stride) / g.cycle
    const sw = Math.sin(phase)
    const cw = Math.cos(phase)
    const reach = mix(0.12, 0.16, run)
    const lift = mix(0.05, 0.08, run)
    const swing = mix(25, 40, run)
    p.tilt = mix(5, 11, run)
    p.frontX = reach * sw
    p.frontY = -lift * Math.max(0, cw)
    p.backX = -reach * sw
    p.backY = -lift * Math.max(0, -cw)
    p.armFront = 10 - swing * sw
    p.armBack = -10 + swing * sw
    p.bob = -0.02 * Math.abs(sw)
    p.sy = 1
    p.tail = mix(20, 0, run) + 6 * sw
    p.ears = -15 * run
    p.curls = 0.03 * run
    if (run > 0.5) p.mouth = 'open'
  }
  if (s.phase === 'walk') {
    if (p.eyes === 'open') p.eyes = 'happy'
    p.mouth = 'open'
  }
  if (h.grounded) {
    const land = since(h.landedAt, t)
    if (land < 0.1) p.sy = 0.86 + (0.14 * land) / 0.1
  }
  const bonk = since(h.bonkedAt, t)
  if (bonk < 0.12) {
    p.sy = 0.9 + (0.1 * bonk) / 0.12
    p.ears = -40
  }
  if (look.bubble && since(h.blewAt, t) < 0.15) {
    Object.assign(p, { blow: true, armFront: 62, reachFront: 0.85, mouth: 'o', blush: 0.8 })
  }
  if (s.tick < h.dizzyUntil) {
    p.tilt += 8 * Math.sin(TAU * 2 * t)
    p.eyes = 'spiral'
    p.mouth = 'wobbly'
  } else if (since(h.hurtAt, t) < 0.3) {
    Object.assign(p, { tilt: -20, armFront: 130, armBack: -145, reachFront: 1, reachBack: 1, frontX: 0.05, backX: -0.05, eyes: 'squeeze', mouth: 'wobbly', ears: -20 })
  }
  return p
}

/** The dress: shoulders, gently convex sides, the scalloped hem. */
function dressPath(ctx: CanvasRenderingContext2D, g: Rig, p: Pose, by: number) {
  const top = g.shoulderY + by
  const sw = g.shoulderW
  const hy = g.hemY + by - p.hemUp
  const hw = g.hemW * p.hem
  const mid = (top + hy) / 2
  const bulge = (hw - sw) * 0.3
  const n = Math.round(g.scallops)
  ctx.beginPath()
  ctx.moveTo(-sw, top)
  ctx.quadraticCurveTo(-(sw + hw) / 2 - bulge, mid, -hw, hy)
  for (let i = 0; i < n; i++) {
    const x0 = -hw + (2 * hw * i) / n
    const x1 = -hw + (2 * hw * (i + 1)) / n
    ctx.quadraticCurveTo((x0 + x1) / 2, hy + 2 * g.scallop, x1, hy)
  }
  ctx.quadraticCurveTo((sw + hw) / 2 + bulge, mid, sw, top)
  ctx.quadraticCurveTo(0, top - 0.03, -sw, top)
  ctx.closePath()
}

/** Adds a rounded cat ear standing on (x, y) to the path, pointing along `a` (radians, 0 straight up, + toward her front). */
function earPath(ctx: CanvasRenderingContext2D, x: number, y: number, a: number, base: number, height: number) {
  const ux = Math.sin(a)
  const uy = -Math.cos(a)
  const vx = -uy
  const vy = ux
  ctx.moveTo(x, y)
  ctx.arcTo(x + (vx * base) / 2, y + (vy * base) / 2, x + ux * height, y + uy * height, base * 0.14)
  ctx.arcTo(x + ux * height, y + uy * height, x - (vx * base) / 2, y - (vy * base) / 2, base * 0.2)
  ctx.arcTo(x - (vx * base) / 2, y - (vy * base) / 2, x + (vx * base) / 2, y + (vy * base) / 2, base * 0.14)
  ctx.closePath()
}

/** The centre of the hand on `side` for an arm at `angle` degrees from hanging down, `reach` times its length. */
function handAt(g: Rig, side: -1 | 1, angle: number, reach: number, by: number): [number, number] {
  const a = angle * DEG
  return [side * g.sleeveX + Math.sin(a) * g.armLen * reach, g.sleeveY + by + Math.cos(a) * g.armLen * reach]
}

/**
 * One arm from its shoulder, with a round mitten hand: a single tube whose path also holds a
 * tiny circle at the hand, which the tube's stroke turns into a disc a little wider than the
 * arm (one ink stroke and one skin stroke for both, so the wrist has no seam).
 */
function arm(ctx: CanvasRenderingContext2D, g: Rig, side: -1 | 1, angle: number, reach: number, by: number, rim: Rim) {
  const [hx, hy] = handAt(g, side, angle, reach, by)
  const r = g.armW * 0.12
  ctx.beginPath()
  ctx.moveTo(side * g.sleeveX, g.sleeveY + by)
  ctx.lineTo(hx, hy)
  ctx.moveTo(hx + r, hy)
  ctx.arc(hx, hy, r, 0, TAU)
  tube(ctx, g.armW, PIA.skin, LINE_DETAIL, rim)
}

/** The bubble wand held in the hand at (hx, hy): a stick and a ring filled like a bubble, up and forward, or to her mouth while she blows. */
function wand(ctx: CanvasRenderingContext2D, g: Rig, p: Pose, hx: number, hy: number, by: number, t: number, rim: Rim) {
  let rx = hx + g.stick * 0.42
  let ry = hy - g.stick * 0.91
  if (p.blow) {
    rx = g.headX + g.headR + g.ringR * 1.2
    ry = g.headY + by + g.mouthY
  }
  const d = Math.hypot(rx - hx, ry - hy)
  const ex = rx - ((rx - hx) / d) * g.ringR
  const ey = ry - ((ry - hy) / d) * g.ringR
  ctx.beginPath()
  ctx.moveTo(hx, hy)
  ctx.lineTo(ex, ey)
  tube(ctx, g.stick * 0.11, PIA.stick, LINE_DETAIL, rim)
  if (!rim) {
    ctx.save()
    ctx.translate(rx, ry)
    bubbleBall(ctx, g.ringR, t)
    ctx.restore()
  }
  ctx.beginPath()
  ctx.arc(rx, ry, g.ringR, 0, TAU)
  tube(ctx, g.ringR * 0.36, PIA.ring, LINE_DETAIL, rim)
}

/** Her face: blush, eyes, mouth. */
function face(ctx: CanvasRenderingContext2D, g: Rig, p: Pose, by: number, t: number) {
  const cx = g.headX
  const cy = g.headY + by
  const ey = cy + g.eyeY
  const stroke = LINE_DETAIL * 0.85
  const alpha = ctx.globalAlpha
  ctx.globalAlpha = alpha * p.blush
  ctx.beginPath()
  for (const bx of [g.blushX0, g.blushX1]) {
    ctx.moveTo(cx + bx + g.blushRx, cy + g.blushY)
    ctx.ellipse(cx + bx, cy + g.blushY, g.blushRx, g.blushRy, 0, 0, TAU)
  }
  ctx.fillStyle = PIA.blush
  ctx.fill()
  ctx.globalAlpha = alpha
  if (p.eyes === 'open') {
    // Both eyes as one shape, then their big and small shines as another.
    ctx.beginPath()
    for (const dx of [g.eyeX0, g.eyeX1]) {
      ctx.moveTo(cx + dx + g.eyeRx, ey)
      ctx.ellipse(cx + dx, ey, g.eyeRx, g.eyeRy, 0, 0, TAU)
    }
    ctx.fillStyle = INK
    ctx.fill()
    ctx.beginPath()
    for (const dx of [g.eyeX0, g.eyeX1]) {
      for (const [sx, sy, r] of [
        [-0.3, -0.38, 0.47],
        [0.35, 0.42, 0.2],
      ] as const) {
        ctx.moveTo(cx + dx + g.eyeRx * (sx + r), ey + g.eyeRy * sy)
        ctx.arc(cx + dx + g.eyeRx * sx, ey + g.eyeRy * sy, g.eyeRx * r, 0, TAU)
      }
    }
    ctx.fillStyle = '#FFFFFF'
    ctx.fill()
  }
  ;[g.eyeX0, g.eyeX1].forEach((dx, i) => {
    const ex = cx + dx
    // The far eye (i = 0) is on her left; outward is away from the other eye.
    const out = i === 0 ? -1 : 1
    if (p.eyes === 'open') return
    if (p.eyes === 'closed' || p.eyes === 'happy') {
      lidPath(ctx, ex, ey, g.eyeRx * 1.25, p.eyes === 'happy')
      ink(ctx, stroke, null)
    } else if (p.eyes === 'wide') {
      ctx.beginPath()
      ctx.ellipse(ex, ey, g.eyeRx * 1.3, g.eyeRy * 1.05, 0, 0, TAU)
      ctx.fillStyle = '#FFFFFF'
      ctx.fill()
      ink(ctx, stroke * 0.8, null)
      ctx.beginPath()
      ctx.arc(ex, ey, g.eyeRx * 0.55, 0, TAU)
      ctx.fillStyle = INK
      ctx.fill()
    } else if (p.eyes === 'spiral') {
      spiralPath(ctx, ex, ey, g.eyeRy * 0.95, 1.5, t * 9 + i * Math.PI)
      ink(ctx, stroke * 0.8, null)
    } else {
      // '> <': each chevron points at the other eye.
      ctx.beginPath()
      ctx.moveTo(ex + out * g.eyeRx, ey - g.eyeRy * 0.75)
      ctx.lineTo(ex - out * g.eyeRx, ey)
      ctx.lineTo(ex + out * g.eyeRx, ey + g.eyeRy * 0.75)
      ink(ctx, stroke, null)
    }
  })
  const mx = cx + g.mouthX
  const my = cy + g.mouthY
  const r = g.mouthR
  if (p.mouth === 'smile') {
    ctx.beginPath()
    ctx.arc(mx, my - r * 0.55, r, Math.PI * 0.2, Math.PI * 0.8)
    ink(ctx, stroke, null)
  } else if (p.mouth === 'open') {
    ctx.beginPath()
    ctx.moveTo(mx - r, my - r * 0.35)
    ctx.lineTo(mx + r, my - r * 0.35)
    ctx.arc(mx, my - r * 0.35, r, 0, Math.PI)
    ctx.closePath()
    ctx.fillStyle = PIA.mouth
    ctx.fill()
    ctx.save()
    ctx.clip()
    ctx.beginPath()
    ctx.ellipse(mx, my + r * 0.55, r * 0.6, r * 0.38, 0, 0, TAU)
    ctx.fillStyle = PIA.tongue
    ctx.fill()
    ctx.restore()
    ctx.beginPath()
    ctx.moveTo(mx - r, my - r * 0.35)
    ctx.lineTo(mx + r, my - r * 0.35)
    ctx.arc(mx, my - r * 0.35, r, 0, Math.PI)
    ctx.closePath()
    ink(ctx, stroke * 0.8, null)
  } else if (p.mouth === 'o') {
    ctx.beginPath()
    ctx.ellipse(mx, my, r * 0.5, r * 0.62, 0, 0, TAU)
    ctx.fillStyle = PIA.mouth
    ctx.fill()
    ink(ctx, stroke * 0.8, null)
  } else {
    wavePath(ctx, mx, my, r * 2.4, r * 0.3, 3)
    ink(ctx, stroke, null)
  }
}

/**
 * The whole figure in one pass: tail, back arm, legs and shoes, dress and collar, sleeves,
 * front arm, back hair, head, face, fringe, headband, ears. With a rim only the outline of
 * every part, so the same call paints the night rim and each band of the halo.
 */
function figure(ctx: CanvasRenderingContext2D, g: Rig, p: Pose, look: Look, t: number, rim: Rim) {
  const detail = !rim && pen.px >= 70
  const by = p.bob * g.stride
  ctx.save()
  if (p.shift || p.rise) ctx.translate(p.shift, -p.rise)
  if (p.tilt) ctx.rotate(p.tilt * DEG)
  ctx.scale(2 - p.sy, p.sy)

  // The tail: a cubic from under the dress, sagging then curling up, its tip white.
  const ta = p.tail * DEG
  const ux = -Math.cos(ta)
  const uy = -Math.sin(ta)
  const wx = uy
  const wy = -ux
  const L = g.tailLen
  const tx = g.tailX
  const ty = g.tailY + by
  const c = [
    tx,
    ty,
    tx + ux * L * 0.35 + wx * L * 0.25,
    ty + uy * L * 0.35 + wy * L * 0.25,
    tx + ux * L * 0.8 + wx * L * 0.12,
    ty + uy * L * 0.8 + wy * L * 0.12,
    tx + ux * L - wx * L * 0.1,
    ty + uy * L - wy * L * 0.1,
  ]
  ctx.beginPath()
  ctx.moveTo(c[0]!, c[1]!)
  ctx.bezierCurveTo(c[2]!, c[3]!, c[4]!, c[5]!, c[6]!, c[7]!)
  tube(ctx, g.tailW, PIA.pink, LINE_DETAIL, rim)
  if (!rim) {
    // The tip: the curve split at k by de Casteljau, its last part stroked white.
    const k = 1 - g.tip / L
    const q = [0, 2, 4].map((i) => [mix(c[i]!, c[i + 2]!, k), mix(c[i + 1]!, c[i + 3]!, k)] as const)
    const r0 = [mix(q[0]![0], q[1]![0], k), mix(q[0]![1], q[1]![1], k)] as const
    const r1 = [mix(q[1]![0], q[2]![0], k), mix(q[1]![1], q[2]![1], k)] as const
    ctx.beginPath()
    ctx.moveTo(mix(r0[0], r1[0], k), mix(r0[1], r1[1], k))
    ctx.bezierCurveTo(r1[0], r1[1], q[2]![0], q[2]![1], c[6]!, c[7]!)
    ctx.lineWidth = g.tailW
    ctx.strokeStyle = PIA.tip
    ctx.stroke()
  }

  arm(ctx, g, -1, p.armBack, p.reachBack, by, rim)

  // Legs from the hips to the shoes, the knee bending forward when the foot comes up (a little
  // longer while she sits, so the knee shows); then both shoes as one part.
  const legs = () => {
    const feet: number[] = []
    for (const side of [-1, 1] as const) {
      const fx = side * g.footX + (side < 0 ? p.backX : p.frontX) * g.stride
      const fy = -g.shoeRy + (side < 0 ? p.backY : p.frontY) * g.stride
      feet.push(fx, fy)
      const ix = side * g.hipX
      const iy = g.hipY + by
      const ax = fx - g.shoeRx * 0.15
      const ay = fy - g.shoeRy * 0.35
      const bone = Math.max((-g.shoeRy * 1.35 - g.hipY) / 2, p.sit ? 0.09 : 0)
      const d = Math.hypot(ax - ix, ay - iy)
      const bend = Math.sqrt(Math.max(0, bone * bone - (d * d) / 4))
      const kx = (ix + ax) / 2 + ((ay - iy) / d) * bend
      const ky = (iy + ay) / 2 - ((ax - ix) / d) * bend
      ctx.beginPath()
      ctx.moveTo(ix, iy)
      ctx.lineTo(kx, ky)
      ctx.lineTo(ax, ay)
      tube(ctx, g.legW, PIA.skin, LINE_DETAIL, rim)
      if (!rim && g.sock > 0.001) {
        const k = Math.min(1, g.sock / Math.hypot(kx - ax, ky - ay))
        ctx.beginPath()
        ctx.moveTo(mix(ax, kx, k), mix(ay, ky, k))
        ctx.lineTo(ax, ay)
        ctx.lineWidth = g.legW
        ctx.strokeStyle = PIA.sock
        ctx.stroke()
      }
    }
    flatPart(
      ctx,
      (c2) => {
        c2.beginPath()
        for (let i = 0; i < 4; i += 2) {
          c2.moveTo(feet[i]! + g.shoeRx * 1.12, feet[i + 1]!)
          c2.ellipse(feet[i]! + g.shoeRx * 0.12, feet[i + 1]!, g.shoeRx, g.shoeRy, 0, 0, TAU)
        }
      },
      PIA.shoe,
      LINE_DETAIL,
      rim,
    )
    if (detail) {
      // The Mary Jane straps.
      ctx.beginPath()
      for (let i = 0; i < 4; i += 2) {
        const fx = feet[i]!
        const fy = feet[i + 1]!
        ctx.moveTo(fx - g.shoeRx * 0.35, fy - g.shoeRy * 0.75)
        ctx.quadraticCurveTo(fx + g.shoeRx * 0.1, fy - g.shoeRy * 0.25, fx + g.shoeRx * 0.45, fy - g.shoeRy * 0.8)
      }
      ink(ctx, LINE_DETAIL * 0.6, null)
    }
  }
  if (!p.sit) legs()

  inkPart(ctx, (c2) => dressPath(c2, g, p, by), look.dress, look.shade, SHADE_CHARACTER * g.stride * 0.7, LINE, rim)
  if (!rim && look.bubble) {
    // Five white dots, placed as fractions across and down the dress.
    ctx.fillStyle = '#FFFFFF'
    const top = g.shoulderY + by
    const hy = g.hemY + by - p.hemUp
    for (const [u, v] of [
      [-0.5, 0.42],
      [0.42, 0.3],
      [0.0, 0.66],
      [0.55, 0.8],
      [-0.55, 0.86],
    ] as const) {
      const half = mix(g.shoulderW, g.hemW * p.hem, v)
      ctx.beginPath()
      ctx.arc(u * half, mix(top, hy, v), 0.035 * (g.headR / BIG.headR), 0, TAU)
      ctx.fill()
    }
  }
  // The collar lies inside her outline, so a rim pass skips it.
  if (!rim) {
    flatPart(
      ctx,
      (c2) => {
        c2.beginPath()
        for (const side of [-1, 1]) {
          c2.moveTo(side * g.collarX + g.collarR, g.shoulderY + by + g.collarR * 0.25)
          c2.arc(side * g.collarX, g.shoulderY + by + g.collarR * 0.25, g.collarR, 0, Math.PI)
          c2.closePath()
        }
      },
      PIA.collar,
      LINE_DETAIL,
      null,
    )
  }
  // The puff sleeves, one part for the sides given. In a rim pass the arms' round ends already
  // cover their outline.
  const sleeves = (sides: readonly (-1 | 1)[]) => {
    if (rim) return
    flatPart(
      ctx,
      (c2) => {
        c2.beginPath()
        for (const side of sides) {
          c2.moveTo(side * g.sleeveX + g.sleeveR, g.sleeveY + by)
          c2.arc(side * g.sleeveX, g.sleeveY + by, g.sleeveR, 0, TAU)
        }
      },
      look.dress,
      LINE_DETAIL,
      null,
    )
  }
  if (p.sit) legs()
  // The front arm (with the wand) is behind the head, raised no higher than its hand shows in front
  // of her chin; only while she blows does it come over her face, with the ring at her mouth.
  const frontArm = () => {
    if (look.bubble) wand(ctx, g, p, ...handAt(g, 1, p.armFront, p.reachFront, by), by, t, rim)
    arm(ctx, g, 1, p.armFront, p.reachFront, by, rim)
  }
  if (p.blow) sleeves([-1])
  else {
    frontArm()
    sleeves([-1, 1])
  }

  // Hair, head, face, fringe, headband, ears.
  const hx = g.headX
  const hy = g.headY + by
  const cloud: number[] = []
  for (let i = 0; i < g.hair.length; i += 3) {
    // A curl lying on an earlier one adds nothing (small Pia's tucked-in shoulder curls): skip it.
    const [x, dy, r] = [g.hair[i]!, g.hair[i + 1]!, g.hair[i + 2]!]
    if (cloud.length && g.hair.slice(0, i).some((v, j) => j % 3 === 0 && Math.abs(v - x) + Math.abs(g.hair[j + 1]! - dy) + Math.abs(g.hair[j + 2]! - r) < 1e-3)) continue
    // Curls hanging below the head's middle swing with the pose; the crown stays.
    cloud.push(hx + x, hy + dy + p.curls * g.stride * clamp01(0.5 + dy / g.headR), r)
  }
  // Curl marks: a short arc on every curl, all one stroke.
  const curls = (xyr: readonly number[], dx: number, dy: number, a0: number, a1: number) => {
    ctx.beginPath()
    for (let i = 0; i < xyr.length; i += 3) {
      const r = xyr[i + 2]!
      const cx = xyr[i]! + dx * r
      const cy = xyr[i + 1]! + dy * r
      ctx.moveTo(cx + Math.cos(a0) * r * 0.42, cy + Math.sin(a0) * r * 0.42)
      ctx.arc(cx, cy, r * 0.42, a0, a1)
    }
    ctx.lineWidth = lw(LINE_DETAIL * 0.7)
    ctx.strokeStyle = PIA.curl
    ctx.stroke()
  }
  blob(ctx, cloud, PIA.hair, PIA.hairShade, 0.035, LINE, rim)
  if (detail) curls(cloud, -0.15, -0.05, Math.PI * 0.9, Math.PI * 1.75)
  inkPart(
    ctx,
    (c2) => {
      c2.beginPath()
      c2.arc(hx, hy, g.headR, 0, TAU)
    },
    PIA.skin,
    PIA.skinShade,
    g.headR * 0.18,
    LINE,
    rim,
  )
  if (!rim) face(ctx, g, p, by, t)
  const fringe: number[] = []
  for (let i = 0; i < g.fringe.length; i += 3) fringe.push(hx + g.fringe[i]!, hy + g.fringe[i + 1]!, g.fringe[i + 2]!)
  blob(ctx, fringe, PIA.hair, PIA.hairShade, 0.025, LINE, rim)
  if (detail) curls(fringe, 0.1, -0.1, Math.PI, Math.PI * 1.8)
  // The headband lies inside her outline (hair and head), so a rim pass skips it.
  const a0 = -168 * DEG
  const a1 = -28 * DEG
  if (!rim) {
    flatPart(
      ctx,
      (c2) => {
        c2.beginPath()
        c2.arc(hx, hy, g.bandR + g.bandW / 2, a0, a1)
        c2.arc(hx, hy, g.bandR - g.bandW / 2, a1, a0, true)
        c2.closePath()
      },
      PIA.pink,
      LINE_DETAIL,
      null,
    )
  }
  // The ears stand on the band, the back one a little smaller; inside, light pink.
  const ears = (inner: boolean) => (c2: CanvasRenderingContext2D) => {
    c2.beginPath()
    for (const [deg, scale] of [
      [-117, 0.9],
      [-66, 1],
    ] as const) {
      const a = deg * DEG
      const tilt = a + Math.PI / 2 + p.ears * DEG
      const height = g.earH * scale
      const lift = inner ? height * 0.2 : 0
      earPath(
        c2,
        hx + Math.cos(a) * g.bandR + Math.sin(tilt) * lift,
        hy + Math.sin(a) * g.bandR - Math.cos(tilt) * lift,
        tilt,
        g.earBase * scale * (inner ? 0.46 : 1),
        height * (inner ? 0.52 : 1),
      )
    }
  }
  flatPart(ctx, ears(false), PIA.pink, LINE_DETAIL, rim)
  if (!rim) {
    ears(true)(ctx)
    ctx.fillStyle = PIA.innerEar
    ctx.fill()
  }
  if (p.blow) {
    frontArm()
    sleeves([1])
  }
  ctx.restore()
}

/**
 * Pia, her feet centre at the origin, facing right, in the pose her state calls for at
 * sim time t (seconds): idle, walk, run, skid, jump, apex, fall, land, bonk, hurt, dizzy,
 * grow and shrink, blow, rescue bubble, pole, walk home, hug; small, big or bubble; with
 * the rainbow ball's halo while it lasts. The caller mirrors her for facing left, and on
 * the Roof calls once with the night rim before the normal pass: with a rim, only her
 * outline (and the outline of what goes with her: speed lines, swirls, hearts).
 */
export function drawHero(ctx: CanvasRenderingContext2D, s: Sim, t: number, rim: Rim): void {
  const h = s.hero
  const { g, look } = build(s, t)
  const p = pose(s, t, g, look)
  const tall = -(g.headY - g.headR)
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  // On the pole she always faces it, whichever way she was facing when she grabbed it.
  if (s.phase === 'pole' && h.facing < 0) ctx.scale(-1, 1)
  // Safe after a hit: she blinks, never fully hidden.
  if (s.tick < h.safeUntil && s.phase !== 'rescue' && Math.floor(t / 0.0625) % 2 === 1) ctx.globalAlpha *= 0.4
  const playing = s.phase === 'play' || s.phase === 'freeze'
  const ball = playing && s.tick < h.ballUntil
  const lines = playing && h.grounded && Math.abs(h.vx) > 0.95 * RUN
  const dizzy = s.tick < h.dizzyUntil

  // Three ink speed lines behind her at a full run.
  if (lines) {
    ctx.save()
    ctx.globalAlpha *= 0.4
    for (let i = 0; i < 3; i++) {
      const len = 0.3 + 0.2 * ((t * 3.1 + i * 0.37) % 1)
      const x = -g.hemW - 0.12 - ((t * 5 + i * 0.29) % 1) * 0.12
      const y = -tall * (0.28 + i * 0.2)
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x - len, y)
      ink(ctx, LINE_DETAIL, rim)
    }
    ctx.restore()
  }

  // The rainbow ball's hearts, on a flat orbit round her middle: the far half behind her.
  const hearts = (front: boolean) => {
    if (!ball) return
    for (let i = 0; i < 3; i++) {
      const a = TAU * (t + i / 3)
      if (Math.sin(a) > 0 !== front) continue
      heartPath(ctx, Math.cos(a) * 0.7, -tall / 2 + Math.sin(a) * 0.22, 0.2)
      if (!rim) {
        ctx.fillStyle = COLOR.heart
        ctx.fill()
      }
      ink(ctx, LINE_DETAIL, rim)
    }
  }
  hearts(false)

  if (ball && !rim) {
    // The halo: her outline three times, outer band first, pulsing; blinking as it runs out.
    ctx.save()
    if (h.ballUntil * STEP - t < BALL_BLINK && Math.floor(t * 8) % 2 === 1) ctx.globalAlpha *= 0.4
    const pulse = 1 + 0.15 * Math.sin(TAU * 2 * t)
    for (const [w, colour] of HALO) figure(ctx, g, p, look, t, { colour, width: w * pulse })
    ctx.restore()
  }

  figure(ctx, g, p, look, t, rim)

  // Dizzy: three ink swirls circling over her head, two turns a second.
  if (dizzy) {
    for (let i = 0; i < 3; i++) {
      const a = TAU * (2 * t + i / 3)
      const x = g.headX + Math.cos(a) * 0.28
      const y = g.headY - g.headR * 0.95 + Math.sin(a) * 0.08
      spiralPath(ctx, x, y, 0.06, 1.6, -t * 12 + i)
      ink(ctx, LINE_DETAIL * 0.8, rim)
    }
  }
  hearts(true)

  // The rescue: a bubble round her, wobbling; mirrored so its shine lands on the bubble ahead of her, not on her hair.
  if (s.phase === 'rescue' && !rim) {
    const wob = 0.04 * Math.sin(TAU * 2 * t)
    ctx.save()
    ctx.translate(-0.06 * g.stride, -h.h / 2 - 0.03 * g.stride)
    ctx.scale(-(1 + wob), 1 - wob)
    bubbleBall(ctx, h.form === 'small' ? 0.75 : 1.15, t)
    ctx.restore()
  }
  ctx.restore()
}
