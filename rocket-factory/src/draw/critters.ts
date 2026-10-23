import { PAD, xOf, yOf } from '../game/board'
import { CHEEKS, NIBBLE_FOR, SHRUG_FOR } from '../game/catalog'
import { STEP, since, type HomeWhy, type Muncher, type MuncherMode, type State, type Thing } from '../game/model'
import { muncherPoint, type Box } from '../game/where'
import { C, MOONY, MUNCHER, NIGHT, THING, TAU, addCapsule, addCircle, arch, blush, circlePath, clamp01, detail, dieCut, eyes, fill, groundShadow, heldAge, loop, mix, openMouth, pen, phaseOf, replay, scaled, shine, smallEntry, smile, smooth, tipped, zees, type SheetEntry } from './look'
import { drawStillThing, drawThing } from './things'

/**
 * The munchers and Moony (plans/rocket-factory.md, Munchers and The rocket), front-view
 * stickers (look.ts rules 1 and 2) with their origin on the ground under the middle.
 *
 * A muncher is a walking raspberry: a pear-shaped berry, wider at the bottom, outlined by
 * BUMPS round drupelets, a green leaf calyx on top, a cream belly patch, big sleepy-lidded
 * eyes and a small soft smile. Its feet hide under the bottom bumps, so it walks with a
 * waddle. Its side bumps are its cheeks: each puffs out one step for each thing it eats, with
 * the thing showing on it. No teeth, no claws, never a frown: it giggles, hops, pats its full
 * cheeks and burps. Each burrow's munchers wear their own mark (a bow, freckles, a flower) so
 * she can name them. It is never a smooth pink ball with a tuft (rule 11): the bumps and the
 * calyx make a silhouette nobody owns.
 *
 * `MuncherPicture` is one frame of a muncher (`muncherPicture` reads it off the state), and
 * `act` turns it into a `Rig`, the pose of that frame: every mode and every way home is a
 * little act on the same body. Moony is the round pale-yellow moon friend who sits on the
 * pad's ring after the launch and waves.
 */

// ---------------------------------------------------------------------------------------
// The muncher's picture

/** One frame of a muncher: what the renderer reads off the state (`muncherPicture`), and what the sheet and the tests make up. */
export interface MuncherPicture {
  /** Its burrow, 0 A, 1 B or 2 C: its mark is a bow, freckles or a flower. */
  burrow: number
  mode: MuncherMode
  /** Why it goes home while its mode is 'home', else null. */
  why: HomeWhy | null
  /** Seconds since its mode began (a stamp's age: Infinity for never, held finite here). */
  age: number
  /** What its cheeks hold, oldest first: the first in its front cheek, the second in its back one, the third in front again. */
  cheeks: readonly Thing[]
  /** Seconds since it took a thing (the newest in its cheeks goes in, then two chews), Infinity for never. */
  nom: number
  /** Seconds since it found its bowl empty (it peers in and shrugs), Infinity for never. */
  shrug: number
  /** Seconds since it began a wave at her, Infinity for none: a burrow's munchers waving hello as its land opens, or sleepily from the doorway at a tap. Any mode can wave. */
  wave: number
  /** How far it has come up out of its doorway, 0 under the sill to 1 standing in it: a peek rises, and a burrow's own stages hold it low (the calyx tips at about 0.25, the sleepy face at about 0.7). */
  rise: number
  /** How high its hop carries it now, cells (where.ts muncherPoint). */
  lift: number
  /** Where it is in its waddle, 0 to 1 over two grid steps: it rocks one way a step. */
  step: number
  facing: -1 | 1
  /** 0 to 1 from its id, so a visit's munchers never blink, breathe or wave in step. */
  phase: number
  /** The scout: the first, slow muncher, a little one. */
  scout: boolean
}

export const MUNCHER_MODES: readonly MuncherMode[] = ['peek', 'out', 'bowl', 'walk', 'sit', 'nap', 'nibble', 'wait', 'caught', 'picnic', 'polite', 'home', 'watch']
export const HOME_WHYS: readonly HomeWhy[] = ['full', 'nothing', 'tickled', 'sudsed', 'fed', 'late', 'night']

/** The berry: bump centres on a pear round (0, cy), `top` and `bottom` its half widths there, so the bottom bumps rest on the ground; the bumps grow from top to bottom. */
const BODY = { cy: -0.33, ry: 0.235, top: 0.16, bottom: 0.29 }
export const BUMPS = 13
const BUMP = { top: 0.068, bottom: 0.088 }
/** A cheek sits on the outline at angle `a` (each side), and each thing in it pushes it out and grows it. */
const CHEEK = { a: 0.13, out: 0.032, grow: 0.037 }
/** The face, nudged toward the front for a three-quarter look: big eyes, a small smile under them, the belly patch low. */
const FACE = { x: 0.028, eyeY: -0.405, eye: 0.1, gap: 0.172, mouthY: -0.318, mouth: 0.078 }
const BELLY = { x: 0.012, y: -0.165, rx: 0.12, ry: 0.083 }
/** The calyx's middle, on the top bump, and its five leaves: angle from straight up, length, width. */
const CALYX_Y = -0.585
const LEAVES = [
  [-1.85, 0.135, 0.05],
  [-0.95, 0.12, 0.05],
  [0, 0.075, 0.042],
  [0.95, 0.12, 0.05],
  [1.85, 0.135, 0.05],
] as const
const HAND = 0.05
/** Where its mouth is in its own frame, standing: a gulp and the crumbs of a nom go there. */
export const MOUTH = { x: FACE.x, y: FACE.mouthY } as const
/** The scout is this much of a muncher. */
const SCOUT = 0.85
/** How high a hop goes (where.ts muncherPoint), for its squash and stretch. */
const HOP_HIGH = 0.18
/** Its height to the calyx: detail reads it at that size. */
const TALL = 0.72
/** The little acts' lengths, seconds: peering in and shrugging at an empty bowl, the sneeze, the burp, the wave before hopping home, a wave at her, a nom (the thing going in, then two chews). */
const SHRUG = SHRUG_FOR * STEP
const SNEEZE = 0.8
const BURP = 0.9
const GREET = 1.1
export const WAVE = 1.6
const NOM = 0.9
const SWALLOW = 0.28
/** The box every picture of a muncher stays inside, from its feet, with its shadow: full cheeks on a napper's squash, a flag held up, a hat, the Zz rising. */
export const MUNCHER_BOX: Box = { x: -0.66, y: -1.04, w: 1.32, h: 1.16 }

type Mood = 'open' | 'sleepy' | 'happy' | 'closed' | 'wide'
type Hand = readonly [number, number] | null

/** A muncher's pose in one frame, in its own frame (facing right, feet at the origin, cells, y down). */
interface Rig {
  /** Off the ground (up), the tip about the feet (positive leans forward), and the squash about the feet. */
  lift: number
  tilt: number
  sx: number
  sy: number
  eyes: Mood
  /** The eyes' glance, toward the front and down. */
  lookX: number
  lookY: number
  mouth: 'smile' | 'grin' | 'o' | 'chew'
  /** How open a grin or an "o" is, 0 to 1. */
  open: number
  /** The back and the front hand, or null tucked away into the bumps. */
  hands: readonly [Hand, Hand]
  /** The calyx's leaves: -1 perked up to 1 drooping. */
  droop: number
  /** Both cheeks puffed this many steps more: a burp coming, a chew. */
  puff: number
  /** The newest thing going into its mouth, 1 at the lips to 0 gone; below 0 when nothing is. */
  gulp: number
  hat: 'none' | 'nightcap' | 'suds'
  /** The little flag's wave (radians), or null with no flag. */
  flag: number | null
  /** A gold bar in its front hand: a picnic. */
  bar: boolean
  zz: boolean
}

/**
 * The muncher in `pic` as a pose at time t (the sim's seconds: blinks, breaths and loops run
 * on it with the muncher's own phase). Each mode is one little act; a fresh wave, shrug or nom
 * plays over whatever the mode does.
 */
function act(pic: MuncherPicture, t: number): Rig {
  const age = heldAge(pic.age)
  const ph = pic.phase
  const blink = loop(t, 3.4, ph) > 0.955
  const breathe = Math.sin(TAU * loop(t, 2.6, ph))
  const r: Rig = {
    lift: pic.lift,
    tilt: 0,
    sx: 1,
    sy: 1 + 0.012 * breathe,
    eyes: blink ? 'closed' : 'sleepy',
    lookX: 0,
    lookY: 0,
    mouth: 'smile',
    open: 0,
    hands: [null, null],
    droop: 0,
    puff: 0,
    gulp: -1,
    hat: 'none',
    flag: null,
    bar: false,
    zz: false,
  }
  const sitting = () => {
    r.sx = 1.04
    r.sy = 0.95 + 0.012 * breathe
  }
  /** Squashed near the ground and stretched up high, the calyx flopping the other way. */
  const hopping = () => {
    const k = clamp01(pic.lift / HOP_HIGH)
    r.sy = mix(0.93, 1.06, k)
    r.sx = 1 / Math.sqrt(r.sy)
    r.droop = 0.5 - k
    r.eyes = blink ? 'closed' : 'open'
  }
  /** The front hand up beside its face, waving at her. */
  const waving = (u: number) => {
    r.hands = [null, [0.34 + 0.04 * Math.sin(TAU * 2.2 * u), -0.52]]
    r.eyes = 'happy'
    r.mouth = 'grin'
    r.open = 0.55
  }
  /** A yawn, u 0 to 1 through it: the mouth opens round, the eyes shut, it stretches up. */
  const yawning = (u: number) => {
    const k = arch(clamp01(u))
    r.mouth = 'o'
    r.open = k
    if (k > 0.25) r.eyes = 'closed'
    r.sy *= 1 + 0.04 * k
    r.tilt -= 0.04 * k
  }
  /** A-choo, u 0 to 1 through it: it leans back with its eyes shut and its mouth opening, then sneezes forward in a squash. */
  const sneezing = (u: number) => {
    if (u < 0.45) {
      const k = smooth(0, 0.45, u)
      r.tilt = -0.12 * k
      r.sy *= 1 + 0.05 * k
      r.eyes = 'closed'
      r.mouth = 'o'
      r.open = k
    } else if (u < 0.65) {
      r.tilt = 0.16
      r.sy *= 0.9
      r.sx *= 1.05
      r.eyes = 'happy'
      r.mouth = 'grin'
      r.open = 1
    } else {
      r.eyes = 'happy'
      r.mouth = 'grin'
      r.open = 0.6
    }
  }
  /** Giggling: happy eyes, an open grin and a little wiggle. */
  const giggling = () => {
    r.eyes = 'happy'
    r.mouth = 'grin'
    r.open = 0.6 + 0.3 * Math.abs(Math.sin(TAU * 3 * t))
    r.tilt += 0.07 * Math.sin(TAU * 3 * t)
  }
  switch (pic.mode) {
    case 'peek': {
      // Waking in the doorway: sleepy blinks, a yawn every few seconds, a look out each way.
      r.lookX = 0.02 * Math.sin(TAU * loop(age, 4, 0.6))
      const y = loop(age + 2.6, 4, 0)
      if (y < 0.4) yawning(y / 0.4)
      break
    }
    case 'out':
      // Hopping out of the door, bright-eyed, its hands up for the jump.
      hopping()
      r.mouth = 'grin'
      r.open = 0.4
      r.hands = [
        [-0.33, -0.38 - 0.1 * clamp01(pic.lift / HOP_HIGH)],
        [0.33, -0.38 - 0.1 * clamp01(pic.lift / HOP_HIGH)],
      ]
      break
    case 'bowl':
      // Off to its burrow's bowl first, looking ahead at it.
      hopping()
      r.lookX = 0.015
      break
    case 'walk': {
      // The waddle: the body rocks onto one hidden foot a step, the calyx bouncing.
      const w = Math.sin(TAU * pic.step)
      r.tilt = 0.09 * w
      r.sy *= 1 - 0.025 * Math.abs(w)
      r.droop = -0.25 + 0.4 * Math.abs(w)
      break
    }
    case 'sit':
      sitting()
      break
    case 'nap':
      // Curled up on the roof: squashed round, tipped back, the calyx flopped over, breathing slowly.
      r.sx = 1.14
      r.sy = 0.76 + 0.02 * Math.sin(TAU * loop(t, 3.2, ph))
      r.tilt = -0.22
      r.eyes = 'closed'
      r.droop = 1
      r.zz = true
      break
    case 'nibble': {
      // Three bites over NIBBLE_FOR: lean in with the mouth open, chomp, lean back chewing.
      const bite = (NIBBLE_FOR * STEP) / 3
      const k = Math.min(2, Math.floor(age / bite))
      const u = clamp01((age - k * bite) / bite)
      const lean = u < 0.25 ? smooth(0, 0.25, u) : 1 - smooth(0.32, 0.7, u)
      r.tilt = 0.18 * lean
      r.hands = [null, lean > 0.2 ? [0.33, -0.3] : null]
      if (u < 0.25) {
        r.mouth = 'grin'
        r.open = smooth(0, 0.25, u)
        r.eyes = 'open'
      } else if (u < 0.8) {
        r.mouth = 'chew'
        r.puff = 0.35 * arch((u - 0.25) / 0.55)
        r.eyes = 'happy'
      }
      break
    }
    case 'wait':
      // Waiting its turn behind a nibbler: a patient sway and a little bounce on its toes.
      r.tilt = 0.05 * Math.sin(TAU * loop(t, 2.2, ph))
      r.lift += 0.03 * arch(clamp01((loop(t, 3, ph) - 0.8) / 0.2))
      r.lookX = 0.02
      break
    case 'caught': {
      // Tickled already, wiggling and giggling with its hands up until Beep comes.
      const w = Math.sin(TAU * 2.4 * age)
      r.tilt = 0.12 * w
      r.sx = 1 + 0.03 * w
      r.eyes = 'happy'
      r.mouth = 'grin'
      r.open = 0.7 + 0.3 * Math.abs(w)
      r.droop = -0.6
      r.hands = [
        [-0.32, -0.56 + 0.04 * w],
        [0.32, -0.56 - 0.04 * w],
      ]
      break
    }
    case 'picnic': {
      // At the bowl with a gold bar, a bite every 1.4 s and a happy chew between.
      sitting()
      const c = loop(age, 1.4, 0)
      const k = arch(c)
      r.bar = true
      r.hands = [null, [mix(0.32, 0.16, k), mix(-0.2, -0.29, k)]]
      r.eyes = blink ? 'closed' : 'happy'
      r.mouth = c > 0.35 && c < 0.6 ? 'grin' : 'chew'
      r.open = 0.7
      r.puff = c > 0.6 ? 0.2 * arch((c - 0.6) / 0.4) : 0
      break
    }
    case 'polite': {
      // Sitting beside the bottle line eating nothing, and every few seconds a wave.
      sitting()
      const c = loop(age, 4, ph)
      if (c < 0.32) waving(c * 4)
      break
    }
    case 'home': {
      // Hopping straight home; how it sets off says why.
      hopping()
      switch (pic.why) {
        case 'full':
          if (age < BURP) {
            // The burp: the cheeks swell, out it comes with a round mouth, a pat on the tummy.
            const u = age / BURP
            r.puff = u < 0.35 ? 0.45 * smooth(0, 0.35, u) : 0.45 * (1 - smooth(0.35, 0.55, u))
            r.eyes = u < 0.35 ? 'wide' : 'happy'
            if (u > 0.35 && u < 0.75) {
              r.mouth = 'o'
              r.open = arch((u - 0.35) / 0.4)
              r.tilt = -0.1
            }
            r.hands = [null, [0.1, -0.17]]
          } else {
            r.eyes = 'happy'
            // Patting its full cheeks on every hop.
            const n = pic.cheeks.length
            if (pic.lift > 0.09 && n > 0) r.hands = [cheekAt(1, Math.floor(n / 2)), cheekAt(0, Math.ceil(n / 2))]
          }
          break
        case 'nothing':
        case 'fed':
        case 'late':
          if (age < GREET) waving(age)
          else if (pic.why === 'fed') r.eyes = 'happy'
          break
        case 'tickled':
          if (age < SNEEZE) sneezing(age / SNEEZE)
          else giggling()
          break
        case 'sudsed':
          r.hat = 'suds'
          if (age < SNEEZE) sneezing(age / SNEEZE)
          else giggling()
          break
        case 'night': {
          // Yawning home in a nightcap for Good night.
          r.hat = 'nightcap'
          r.eyes = 'sleepy'
          const y = loop(age, 2.4, ph)
          if (y < 0.45) yawning(y / 0.45)
          break
        }
        case null:
          throw new Error('a muncher hopping home needs a why')
      }
      break
    }
    case 'watch':
      // By the pad for the launch, looking up, a little flag waving in its front hand.
      sitting()
      r.eyes = blink ? 'closed' : 'open'
      r.lookY = -0.02
      r.mouth = 'grin'
      r.open = 0.45
      r.flag = 0.3 * Math.sin(TAU * loop(t, 0.8, ph))
      r.hands = [null, [0.3, -0.42]]
      r.lift += 0.03 * arch(clamp01((loop(t, 2.2, ph) - 0.75) / 0.25))
      break
  }
  const wave = heldAge(pic.wave)
  if (wave < WAVE) waving(wave)
  const shrug = heldAge(pic.shrug)
  if (shrug < SHRUG) {
    // An empty bowl: it peers in, then shrugs with both hands up and goes looking for fizz.
    if (shrug < 0.35) {
      r.tilt = 0.15
      r.lookY = 0.02
      r.eyes = 'open'
    } else {
      const k = arch((shrug - 0.35) / (SHRUG - 0.35))
      r.hands = [
        [-0.34, -0.44 - 0.08 * k],
        [0.34, -0.44 - 0.08 * k],
      ]
      r.sy *= 1 + 0.04 * k
      r.tilt = 0.06 * Math.sin(TAU * (shrug - 0.35))
      r.eyes = 'open'
      r.lookY = -0.015 * k
      r.mouth = 'smile'
    }
  }
  const nom = heldAge(pic.nom)
  const n = pic.cheeks.length
  if (nom < NOM && n > 0 && (pic.mode === 'sit' || pic.mode === 'caught')) {
    // Nom nom: the thing goes in through an open mouth, two chews, a pat on the cheek it went into.
    if (nom < SWALLOW) {
      r.gulp = 1 - nom / SWALLOW
      r.mouth = 'grin'
      r.open = 0.85
    } else {
      const c = ((nom - SWALLOW) / ((NOM - SWALLOW) / 2)) % 1
      r.mouth = arch(c) > 0.3 ? 'o' : 'chew'
      r.open = 0.45 * arch(c)
      r.puff = 0.35 * arch(c)
      r.sy *= 1 - 0.03 * arch(c)
      if (nom > NOM * 0.7) r.hands = (n - 1) % 2 === 0 ? [null, cheekAt(0, Math.ceil(n / 2))] : [cheekAt(1, Math.floor(n / 2)), null]
    }
    r.eyes = 'happy'
  }
  return r
}

/** Where the bump at angle a sits on the berry's outline (a = 0 the front side, PI/2 the bottom) and how big it is: [x, y, r]. */
function edgeAt(a: number): [number, number, number] {
  const down = (1 + Math.sin(a)) / 2
  const rx = mix(BODY.top, BODY.bottom, down)
  return [rx * Math.cos(a), BODY.cy + BODY.ry * Math.sin(a), mix(BUMP.top, BUMP.bottom, down)]
}

/** The middle of a cheek (side 0 the front, 1 the back) holding n things (fractions puff it partway). */
function cheekAt(side: 0 | 1, n: number): [number, number] {
  const a = side === 0 ? CHEEK.a : Math.PI - CHEEK.a
  const [x, y] = edgeAt(a)
  const out = n * CHEEK.out
  return [x + Math.cos(a) * out, y + Math.sin(a) * out]
}

/** Adds a pointed leaf from (bx, by) toward `angle` (radians from straight up, positive to the front), `len` long and `w` wide, to the path being built, wound clockwise on screen like look.ts's add... pieces. */
function addLeaf(ctx: CanvasRenderingContext2D, bx: number, by: number, angle: number, len: number, w: number) {
  const dx = Math.sin(angle)
  const dy = -Math.cos(angle)
  const mx = bx + dx * len * 0.5
  const my = by + dy * len * 0.5
  ctx.moveTo(bx, by)
  ctx.quadraticCurveTo(mx + dy * w, my - dx * w, bx + dx * len, by + dy * len)
  ctx.quadraticCurveTo(mx - dy * w, my + dx * w, bx, by)
  ctx.closePath()
}

/** The calyx's leaf angles with the droop: the outer pair flop down or perk up most. */
const leafAngle = (i: number, droop: number) => {
  const [a] = LEAVES[i]!
  return a + Math.sign(a) * droop * (Math.abs(a) > 1 ? 0.3 : 0.22) + (a === 0 ? -0.35 * droop : 0)
}

/**
 * The muncher in `pic` at time t: origin on the ground under its middle, facing pic.facing,
 * a sticker (rim and shadow) at the detail its size on screen calls for. S keeps the
 * silhouette, the face, the belly patch, the cheeks with their things and the mark (all but
 * the freckles); M adds a light dot on the top drupelets; L puts one on every drupelet.
 */
export function drawMuncher(ctx: CanvasRenderingContext2D, pic: MuncherPicture, t: number): void {
  if (pic.cheeks.length > CHEEKS) throw new Error(`a muncher holds at most ${CHEEKS} things, not ${pic.cheeks.length}`)
  const r = act(pic, t)
  const k = pic.scout ? SCOUT : 1
  const lod = detail(TALL * k)
  const hopper = pic.mode === 'out' || pic.mode === 'bowl' || pic.mode === 'home'
  ctx.save()
  if (pic.rise < 1) {
    // Still in the doorway: only what has come up over the sill shows.
    ctx.beginPath()
    ctx.rect(MUNCHER_BOX.x, MUNCHER_BOX.y, MUNCHER_BOX.w, -MUNCHER_BOX.y)
    ctx.clip()
    ctx.translate(0, (1 - clamp01(pic.rise)) * 0.72 * k)
  }
  tipped(ctx, 0, pic.facing, 1, () =>
    scaled(ctx, k, () => {
      if (hopper) groundShadow(ctx, 0.52, r.lift)
      ctx.translate(0, -r.lift)
      tipped(ctx, r.tilt, r.sx, r.sy, () => berry(ctx, pic, r, lod, t))
    }),
  )
  ctx.restore()
}

/** The berry itself in its posed frame: the die-cut, the body and its drupelets, the cheeks and what is in them, the calyx, the mark, the face, a hat, the hands, a flag or a bar, a gulp, the Zz. */
function berry(ctx: CanvasRenderingContext2D, pic: MuncherPicture, r: Rig, lod: 'S' | 'M' | 'L', t: number) {
  const n = pic.cheeks.length
  // The newest thing is still on its way in during a gulp: its cheek fills as it goes.
  const gulping = r.gulp >= 0
  const filled: [number, number] = [Math.ceil(n / 2), Math.floor(n / 2)]
  if (gulping) filled[(n - 1) % 2] -= r.gulp
  const cheekXYR = ([0, 1] as const).flatMap((side) => {
    const m = filled[side]! + r.puff
    if (m <= 0) return []
    const [x, y] = cheekAt(side, m)
    return [x, y, mix(BUMP.top, BUMP.bottom, (1 + Math.sin(CHEEK.a)) / 2) + m * CHEEK.grow]
  })
  const bumps: number[] = []
  for (let i = 0; i < BUMPS; i++) bumps.push(...edgeAt(-Math.PI / 2 + (TAU * i) / BUMPS))
  const leaves = LEAVES.map(([, len, w], i) => [leafAngle(i, r.droop), len, w] as const)
  const stem = () => {
    ctx.moveTo(0, CALYX_Y)
    ctx.quadraticCurveTo(0.005, CALYX_Y - 0.05, 0.03 + 0.02 * r.droop, CALYX_Y - 0.08 + 0.02 * r.droop)
  }
  const body = () => {
    ctx.beginPath()
    for (let i = 0; i < 2 * BUMPS; i++) {
      const [x, y] = edgeAt(-Math.PI / 2 + (TAU * i) / (2 * BUMPS))
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
    for (let i = 0; i < bumps.length; i += 3) addCircle(ctx, bumps[i]!, bumps[i + 1]!, bumps[i + 2]!)
    for (let i = 0; i < cheekXYR.length; i += 3) addCircle(ctx, cheekXYR[i]!, cheekXYR[i + 1]!, cheekXYR[i + 2]!)
  }
  /** Each raised hand's stubby arm from its shoulder on the upper side of the berry, and the paws at their ends: one shape with the body. */
  const limbs = () =>
    r.hands.forEach((h, side) => {
      if (!h) return
      const [sx, sy] = edgeAt(side === 1 ? -0.4 : Math.PI + 0.4)
      addCapsule(ctx, sx, sy, h[0], h[1], HAND * 0.75)
    })
  const paws = () =>
    r.hands.forEach((h) => {
      if (h) addCircle(ctx, h[0], h[1], HAND)
    })
  const flagPole = r.flag === null ? null : ([r.hands[1]![0], r.hands[1]![1], r.hands[1]![0] + 0.04, r.hands[1]![1] - 0.42] as const)
  const flagPath = () => {
    const [, , fx, fy] = flagPole!
    const wave = r.flag!
    ctx.moveTo(fx, fy)
    ctx.quadraticCurveTo(fx + 0.09, fy + 0.02 + 0.04 * wave, fx + 0.18, fy + 0.03 + 0.06 * wave)
    ctx.quadraticCurveTo(fx + 0.1, fy + 0.08 + 0.03 * wave, fx + 0.01, fy + 0.13)
    ctx.closePath()
  }
  dieCut(
    ctx,
    () => {
      body()
      for (const [a, len, w] of leaves) addLeaf(ctx, 0, CALYX_Y, a, len, w)
      stem()
      limbs()
      paws()
      if (pic.burrow === 0) addBow(ctx)
      if (r.hat === 'nightcap') addNightcap(ctx)
      if (r.hat === 'suds') for (const [x, y, rr] of SUDS) addCircle(ctx, x, y, rr)
      if (flagPole) {
        ctx.moveTo(flagPole[0], flagPole[1])
        ctx.lineTo(flagPole[2], flagPole[3])
        flagPath()
      }
    },
    0,
  )
  body()
  limbs()
  fill(ctx, MUNCHER.body)
  // Drupelets: a light dot on each bump's upper side (L), or on the top ones (M).
  if (lod !== 'S') {
    ctx.beginPath()
    for (let i = 0; i < bumps.length; i += 3) {
      const [x, y, rr] = [bumps[i]!, bumps[i + 1]!, bumps[i + 2]!]
      if (lod === 'M' && y > BODY.cy) continue
      addCircle(ctx, x - rr * 0.28, y - rr * 0.32, rr * 0.24)
    }
    for (let i = 0; i < cheekXYR.length; i += 3) addCircle(ctx, cheekXYR[i]! - cheekXYR[i + 2]! * 0.3, cheekXYR[i + 1]! - cheekXYR[i + 2]! * 0.36, cheekXYR[i + 2]! * 0.2)
    fill(ctx, MUNCHER.light)
  } else shine(ctx, -0.06, -0.47, 0.13)
  ctx.beginPath()
  ctx.ellipse(BELLY.x, BELLY.y, BELLY.rx, BELLY.ry, 0, 0, TAU)
  fill(ctx, MUNCHER.belly)
  // What is in its cheeks, on the cheeks: the newest shows there once it is swallowed. Each lies flat on the berry, so its shadow is short.
  const flat = (draw: () => void) => {
    const shadow = [pen.shadowX, pen.shadowY] as const
    pen.shadowX *= 0.35
    pen.shadowY *= 0.35
    draw()
    pen.shadowX = shadow[0]
    pen.shadowY = shadow[1]
  }
  const shown = pic.cheeks.map((thing, i) => ({ thing, i })).filter(({ i }) => !(gulping && i === n - 1))
  const twos = [0, 1].map((side) => shown.filter(({ i }) => i % 2 === side).length > 1)
  flat(() =>
    shown.forEach(({ thing, i }) => {
      // Two in one cheek sit one up and in, the other down and out.
      const side = (i % 2) as 0 | 1
      const [cx, cy] = cheekAt(side, filled[side]! + r.puff)
      const two = twos[side]!
      const first = i < 2
      const dx = two ? (first ? -0.035 : 0.035) * (side === 0 ? 1 : -1) : 0
      const dy = two ? (first ? -0.045 : 0.045) : 0
      ctx.save()
      ctx.translate(cx + dx, cy + dy)
      drawStillThing(ctx, thing, two ? 0.15 : 0.17, t, pic.phase * 1000 + i)
      ctx.restore()
    }),
  )
  // The calyx: five leaves, the stem and the middle leaf lighter.
  ctx.beginPath()
  leaves.forEach(([a, len, w], i) => {
    if (i !== 2) addLeaf(ctx, 0, CALYX_Y, a, len, w)
  })
  fill(ctx, MUNCHER.calyx)
  ctx.beginPath()
  addLeaf(ctx, 0, CALYX_Y, leaves[2]![0], leaves[2]![1], leaves[2]![2])
  fill(ctx, MUNCHER.calyxLight)
  ctx.beginPath()
  stem()
  const cap = ctx.lineCap
  ctx.lineCap = 'round'
  ctx.lineWidth = 0.032
  ctx.strokeStyle = MUNCHER.calyxLight
  ctx.stroke()
  ctx.lineCap = cap
  // The burrow's mark.
  if (pic.burrow === 0) {
    ctx.beginPath()
    addBow(ctx)
    fill(ctx, MUNCHER.bow)
  } else if (pic.burrow === 1 && lod !== 'S') {
    ctx.beginPath()
    for (const side of [-1, 1])
      for (const [fx, fy] of [
        [-0.032, 0.072],
        [0, 0.088],
        [0.032, 0.072],
      ] as const)
        addCircle(ctx, FACE.x + side * FACE.gap * 0.62 + fx, FACE.eyeY + fy, 0.017)
    fill(ctx, MUNCHER.freckle)
  } else if (pic.burrow === 2) {
    ctx.beginPath()
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU - Math.PI / 2
      addCircle(ctx, FLOWER.x + Math.cos(a) * 0.034, FLOWER.y + Math.sin(a) * 0.034, 0.027)
    }
    fill(ctx, C.white)
    circlePath(ctx, FLOWER.x, FLOWER.y, 0.022)
    fill(ctx, MUNCHER.flower)
  }
  // The face: big eyes under sleepy lids, a small soft mouth.
  const fx = FACE.x + r.lookX
  if (r.eyes === 'sleepy') sleepyEyes(ctx, fx, FACE.eyeY + r.lookY, FACE.eye, FACE.gap)
  else eyes(ctx, fx, FACE.eyeY + r.lookY, FACE.eye, FACE.gap, r.eyes, MUNCHER.body)
  const my = FACE.mouthY + r.lookY * 0.5
  if (r.mouth === 'smile') smile(ctx, fx, my, FACE.mouth, false)
  else if (r.mouth === 'chew') smile(ctx, fx + 0.01, my + 0.004, FACE.mouth * 0.62, false)
  else if (r.mouth === 'grin') openMouth(ctx, fx, my, FACE.mouth * 1.25, 0.012 + 0.05 * r.open, false)
  else openMouth(ctx, fx, my - 0.005, 0.035 + 0.03 * r.open, 0.035 + 0.035 * r.open, true)
  // A hat for the way home.
  if (r.hat === 'nightcap') {
    ctx.beginPath()
    addNightcap(ctx)
    fill(ctx, NIGHT.nightcap)
    ctx.beginPath()
    ctx.moveTo(-0.2, -0.535)
    ctx.quadraticCurveTo(0, -0.6, 0.2, -0.55)
    ctx.lineCap = 'round'
    ctx.lineWidth = 0.05
    ctx.strokeStyle = C.white
    ctx.stroke()
    ctx.lineCap = cap
    circlePath(ctx, NIGHTCAP_TIP.x, NIGHTCAP_TIP.y, 0.045)
    fill(ctx, C.white)
  } else if (r.hat === 'suds') {
    ctx.beginPath()
    for (const [x, y, rr] of SUDS) addCircle(ctx, x, y, rr)
    fill(ctx, MUNCHER.suds)
    if (lod !== 'S') {
      ctx.beginPath()
      for (const [x, y, rr] of SUDS) addCircle(ctx, x + rr * 0.3, y + rr * 0.45, rr * 0.22)
      fill(ctx, THING.bubble.fold)
    }
  }
  // A gold bar held up for a picnic, behind the hand that holds it.
  if (r.bar) {
    const [hx, hy] = r.hands[1]!
    ctx.save()
    ctx.translate(hx - 0.04, hy - 0.05)
    drawStillThing(ctx, 'goldBar', 0.2, t, pic.phase * 1000 + 7)
    ctx.restore()
  }
  // The flag's pole and its little flag, the hand round the pole.
  if (flagPole) {
    ctx.beginPath()
    ctx.moveTo(flagPole[0], flagPole[1])
    ctx.lineTo(flagPole[2], flagPole[3])
    ctx.lineCap = 'round'
    ctx.lineWidth = 0.025
    ctx.strokeStyle = MUNCHER.fold
    ctx.stroke()
    ctx.lineCap = cap
    ctx.beginPath()
    flagPath()
    fill(ctx, MUNCHER.flag)
  }
  ctx.beginPath()
  paws()
  fill(ctx, MUNCHER.body)
  if (lod !== 'S') {
    ctx.beginPath()
    for (const h of r.hands) if (h) addCircle(ctx, h[0] - HAND * 0.3, h[1] - HAND * 0.32, HAND * 0.26)
    fill(ctx, MUNCHER.light)
  }
  // The newest thing going in at the lips, shrinking as it goes.
  if (gulping) {
    ctx.save()
    ctx.translate(fx + 0.05 * r.gulp, my + 0.01)
    flat(() => drawThing(ctx, pic.cheeks[n - 1]!, 0.26 * r.gulp, t, pic.phase * 1000 + n - 1))
    ctx.restore()
  }
  if (r.zz) zees(ctx, 0.14, -0.6, t, pic.phase)
}

/**
 * The munchers' resting look: the face kit's big dot eyes under heavy lids that droop toward
 * the outer corners, a glint still showing under each, so they look sleepy and sweet. A lid
 * straight across the middle (the kit's own sleepy) reads as bored, and one that dips in the
 * middle or toward the nose reads as cross.
 */
function sleepyEyes(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, gap: number) {
  eyes(ctx, x, y, size, gap, 'open', MUNCHER.body)
  const r = size / 2
  for (const side of [-1, 1]) {
    const ex = x + (side * gap) / 2
    const inner = y - 0.55 * r
    const outer = y - 0.1 * r
    ctx.save()
    circlePath(ctx, ex, y, r * 1.06)
    ctx.clip()
    ctx.beginPath()
    ctx.moveTo(ex - side * 1.2 * r, inner)
    ctx.quadraticCurveTo(ex, (inner + outer) / 2 + 0.1 * r, ex + side * 1.2 * r, outer)
    ctx.lineTo(ex + side * 1.2 * r, y - 1.2 * r)
    ctx.lineTo(ex - side * 1.2 * r, y - 1.2 * r)
    ctx.closePath()
    fill(ctx, MUNCHER.body)
    ctx.restore()
  }
  ctx.beginPath()
  for (const side of [-1, 1]) addCircle(ctx, x + (side * gap) / 2 + r * 0.3, y + r * 0.05, r * (size * pen.ppm < 4 ? 0.34 : 0.25))
  fill(ctx, C.white)
}

/** Burrow A's bow, tied by the calyx on the back of its head: two loops and a knot, added to the path being built. */
const BOW = { x: -0.135, y: -0.585, tilt: -0.35 }
function addBow(ctx: CanvasRenderingContext2D) {
  for (const side of [-1, 1]) {
    const x = BOW.x + side * 0.042 * Math.cos(BOW.tilt)
    const y = BOW.y + side * 0.042 * Math.sin(BOW.tilt)
    const a = BOW.tilt + side * 0.35
    ctx.moveTo(x + 0.044 * Math.cos(a), y + 0.044 * Math.sin(a))
    ctx.ellipse(x, y, 0.044, 0.03, a, 0, TAU)
  }
  addCircle(ctx, BOW.x, BOW.y, 0.02)
}
/** Burrow C's daisy, tucked in on the front of its head under the calyx, on the berry so its white petals show. */
const FLOWER = { x: 0.15, y: -0.49 }
/** The nightcap: a floppy cone over the calyx, its tail flopped down the back to a pompom, added to the path being built. */
const NIGHTCAP_TIP = { x: -0.33, y: -0.63 }
function addNightcap(ctx: CanvasRenderingContext2D) {
  ctx.moveTo(-0.2, -0.535)
  ctx.quadraticCurveTo(-0.24, -0.65, NIGHTCAP_TIP.x, NIGHTCAP_TIP.y)
  ctx.quadraticCurveTo(-0.27, -0.8, -0.06, -0.8)
  ctx.quadraticCurveTo(0.16, -0.78, 0.2, -0.55)
  ctx.quadraticCurveTo(0, -0.6, -0.2, -0.535)
  ctx.closePath()
  addCircle(ctx, NIGHTCAP_TIP.x, NIGHTCAP_TIP.y, 0.045)
}
/** A hat of suds: a heap of foam on its head, one of the tower's puffs that landed. */
const SUDS = [
  [0, -0.66, 0.085],
  [-0.12, -0.62, 0.068],
  [0.12, -0.63, 0.066],
  [-0.05, -0.74, 0.056],
  [0.065, -0.745, 0.05],
  [0.19, -0.71, 0.024],
] as const

// ---------------------------------------------------------------------------------------
// From the state

/**
 * Muncher m at sim time t as a picture: its point's hop and waddle (where.ts), which way it
 * faces, its acts' ages. It faces the way it moves; sitting, upstream (where its things come
 * from); caught, toward Beep; otherwise toward the pad, the way the factory is.
 *
 * The shrug is the sim's own (munchers.ts): a muncher at its burrow's empty bowl stays in
 * mode 'bowl' with its hop over, from its arrival (modeAt) for SHRUG_FOR, then walks off.
 */
export function muncherPicture(s: State, m: Muncher, t: number): MuncherPicture {
  const p = muncherPoint(m, t)
  const age = since(m.modeAt, t)
  let dx = 0
  if (m.hop) dx = m.hop.x1 - m.hop.x0
  else if (m.toward !== m.cell) dx = xOf(m.toward) - xOf(m.cell)
  else if (m.mode === 'sit') dx = s.belts.in[m.cell] === 0 ? 1 : s.belts.in[m.cell] === 2 ? -1 : 0
  else if (m.mode === 'caught') dx = s.beep.x - p.x
  if (dx === 0) dx = PAD.x + 1.5 - p.x
  const stepU = m.toward === m.cell ? 0 : clamp01(since(m.stepAt, t) / (m.stepFor * STEP))
  const parity = (xOf(m.cell) + yOf(m.cell)) % 2
  return {
    burrow: m.burrow,
    mode: m.mode,
    why: m.homeWhy,
    age,
    cheeks: m.cheeks,
    nom: since(m.grabAt, t),
    shrug: m.mode === 'bowl' && m.hop === null ? age : Infinity,
    wave: Infinity,
    rise: m.mode === 'peek' ? smooth(0, 0.6, heldAge(age)) : 1,
    lift: p.lift,
    step: (parity + stepU) / 2,
    facing: dx < 0 ? -1 : 1,
    phase: phaseOf(m.id),
    scout: m.scout,
  }
}

// ---------------------------------------------------------------------------------------
// Moony

/** Moony's body (sitting, a little squashed), its craters, and its little hands. */
const MOON = { y: -0.205, rx: 0.215, ry: 0.2 }
const CRATERS = [
  [-0.1, -0.3, 0.038],
  [-0.14, -0.13, 0.026],
  [0.13, -0.085, 0.03],
] as const
const MOON_HAND = 0.042
/** The box every picture of Moony stays inside, from where it sits, with its shadow: its waving hand reaches out to the front. */
export const MOONY_BOX: Box = { x: -0.36, y: -0.66, w: 0.82, h: 0.74 }

/**
 * Moony at time t, origin where it sits on the pad's ring, facing right: a round pale-yellow
 * moon with craters, a happy face and two little hands, waving every few seconds, its soft
 * shadow under it. `hop` is the seconds since a tap made it hop and squeak (Infinity for
 * none): a squash, a little hop and a wide-eyed landing.
 */
export function drawMoony(ctx: CanvasRenderingContext2D, t: number, hop: number): void {
  const lod = detail(0.45)
  const h = heldAge(hop)
  const u = clamp01(h / 0.6)
  const up = h < 0.6 ? 0.16 * arch(clamp01((u - 0.15) / 0.85)) : 0
  const sy = h < 0.6 ? (u < 0.15 ? 1 - 0.5 * u : u > 0.9 ? 0.95 : 1.04) : 1 + 0.012 * Math.sin(TAU * loop(t, 2.8, 0.3))
  const w = loop(t, 3.2, 0.1)
  const waving = w < 0.4
  const blink = loop(t, 3.7, 0.5) > 0.96
  const front: [number, number] = waving ? [0.26 + 0.04 * Math.sin(TAU * 2.2 * t), -0.34] : [0.215, -0.085]
  const back: [number, number] = [-0.215, -0.085]
  ctx.save()
  groundShadow(ctx, 0.4, up)
  ctx.translate(0, -up)
  tipped(ctx, 0, 1 / Math.sqrt(sy), sy, () => {
    const outline = () => {
      ctx.beginPath()
      ctx.ellipse(0, MOON.y, MOON.rx, MOON.ry, 0, 0, TAU)
      addCircle(ctx, front[0], front[1], MOON_HAND)
      addCircle(ctx, back[0], back[1], MOON_HAND)
    }
    dieCut(ctx, outline, 0)
    ctx.beginPath()
    ctx.ellipse(0, MOON.y, MOON.rx, MOON.ry, 0, 0, TAU)
    fill(ctx, MOONY.body)
    ctx.beginPath()
    ctx.ellipse(-0.08, -0.31, 0.075, 0.045, -0.55, 0, TAU)
    fill(ctx, MOONY.light)
    ctx.beginPath()
    for (const [x, y, r] of lod === 'S' ? CRATERS.slice(0, 1) : CRATERS) addCircle(ctx, x, y, r)
    fill(ctx, MOONY.fold)
    const happy = waving || h < 0.6
    eyes(ctx, 0.035, -0.23, 0.062, 0.105, blink ? 'closed' : h < 0.6 ? 'wide' : happy ? 'happy' : 'open', MOONY.body)
    if (happy) openMouth(ctx, 0.035, -0.17, 0.065, 0.035, false)
    else smile(ctx, 0.035, -0.17, 0.06, false)
    if (lod !== 'S') {
      blush(ctx, 0.035 - 0.1, -0.165, 0.026)
      blush(ctx, 0.035 + 0.1, -0.165, 0.026)
    }
    ctx.beginPath()
    addCircle(ctx, front[0], front[1], MOON_HAND)
    addCircle(ctx, back[0], back[1], MOON_HAND)
    fill(ctx, MOONY.body)
  })
  ctx.restore()
}

// ---------------------------------------------------------------------------------------
// The sheet

/** A muncher of burrow b in `mode`, with two things in its cheeks, at rest unless `patch` says otherwise. */
const still = (mode: MuncherMode, b: number, patch: Partial<MuncherPicture>): MuncherPicture => ({
  burrow: b,
  mode,
  why: mode === 'home' ? 'nothing' : null,
  age: 3,
  cheeks: ['greenBottle', 'orangeBottle'],
  nom: Infinity,
  shrug: Infinity,
  wave: Infinity,
  rise: 1,
  lift: 0,
  step: 0,
  facing: 1,
  phase: 0.3 * b,
  scout: false,
  ...patch,
})
/** A hop's height over time: a little bounce a second, as where.ts makes it. */
const bouncing = (t: number) => HOP_HIGH * Math.abs(Math.sin(Math.PI * t))
const muncher = (label: string, pic: (t: number) => MuncherPicture): SheetEntry => ({ label, box: MUNCHER_BOX, draw: (ctx, t) => drawMuncher(ctx, pic(t), t) })

/** ?sheet=critters: every mode, every way home, the cheeks from empty to full, each burrow's mark, the scout, a peek's stages, smaller sizes, and Moony. */
export const SHEET = (): SheetEntry[] => [
  muncher('peek (rising, then yawning)', (t) => still('peek', 0, { age: t % 6, rise: smooth(0, 0.6, t % 6) })),
  muncher('peek: the calyx tips over the sill', (t) => still('peek', 1, { age: t, rise: 0.25 })),
  muncher('peek: the sleepy face leans out', (t) => still('peek', 2, { age: t, rise: 0.7 })),
  muncher('peek, waving sleepily at a tap', (t) => still('peek', 0, { age: t, rise: 0.7, cheeks: [], wave: replay(t, WAVE) })),
  muncher('out (hopping out)', (t) => still('out', 0, { lift: bouncing(t) })),
  muncher('bowl (hopping to it)', (t) => still('bowl', 1, { lift: bouncing(t), cheeks: [] })),
  muncher('bowl empty: peers in, shrugs', (t) => still('walk', 1, { cheeks: [], shrug: replay(t, SHRUG) })),
  muncher('walk (a waddle)', (t) => still('walk', 2, { step: loop(t, 1.67, 0), lift: 0.08 * Math.abs(Math.sin(TAU * loop(t, 1.67, 0))) })),
  muncher('sit, nom every 2 s', (t) => still('sit', 0, { nom: t % 2, cheeks: (['greenBottle', 'goldBar', 'orangeBottle', 'gear'] as const).slice(0, 1 + (Math.floor(t / 2) % 4)) })),
  muncher('nap on a roof (Zz)', () => still('nap', 1, {})),
  muncher('nibble a hedge, three bites', (t) => still('nibble', 2, { age: t % ((NIBBLE_FOR * STEP) + 1) })),
  muncher('wait behind a nibbler', () => still('wait', 0, {})),
  muncher('caught, waiting for Beep', (t) => still('caught', 1, { age: t })),
  muncher('picnic at the bowl', (t) => still('picnic', 2, { age: t, cheeks: [] })),
  muncher('polite, waving', (t) => still('polite', 0, { age: t, cheeks: [] })),
  ...HOME_WHYS.map((why, i) =>
    muncher(`home: ${why}`, (t) =>
      still('home', i % 3, {
        why,
        age: replay(t, 3),
        lift: (t % 4) > 1.1 ? bouncing(t) : 0,
        cheeks: why === 'full' ? ['greenBottle', 'orangeBottle', 'goldBar', 'gear'] : why === 'tickled' || why === 'sudsed' ? [] : ['greenBottle'],
      }),
    ),
  ),
  muncher('watch the launch with a flag', () => still('watch', 2, { cheeks: [] })),
  ...[0, 1, 2, 3, 4].flatMap((n) =>
    [0, 1, 2].map((b) => muncher(`burrow ${'ABC'[b]}, ${n} in its cheeks`, () => still('sit', b, { cheeks: (['greenBottle', 'orangeBottle', 'blueBar', 'gear'] as const).slice(0, n) }))),
  ),
  muncher('the scout', (t) => still('walk', 0, { scout: true, cheeks: [], step: loop(t, 2.1, 0) })),
  muncher('facing left, walking', (t) => still('walk', 1, { facing: -1, step: loop(t, 1.67, 0) })),
  muncher('facing left, nom', (t) => still('sit', 2, { facing: -1, nom: t % 2 })),
  ...[0.6, 0.4].flatMap((k) => [
    smallEntry(`walk at ${k}x`, k, MUNCHER_BOX, (ctx, t) => drawMuncher(ctx, still('walk', 0, { step: loop(t, 1.67, 0) }), t)),
    smallEntry(`nap at ${k}x`, k, MUNCHER_BOX, (ctx, t) => drawMuncher(ctx, still('nap', 1, {}), t)),
    smallEntry(`full cheeks at ${k}x`, k, MUNCHER_BOX, (ctx, t) => drawMuncher(ctx, still('sit', 2, { cheeks: ['greenBottle', 'orangeBottle', 'goldBar', 'gear'] }), t)),
  ]),
  { label: 'Moony waving', box: MOONY_BOX, draw: (ctx, t) => drawMoony(ctx, t, Infinity) },
  { label: 'Moony hops when tapped', box: MOONY_BOX, draw: (ctx, t) => drawMoony(ctx, t, t % 2) },
  smallEntry('Moony at 0.6x', 0.6, MOONY_BOX, (ctx, t) => drawMoony(ctx, t, Infinity)),
]
