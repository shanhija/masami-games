import type { Room, Sim, SimEvent } from '../game/model'
import { gapAt } from '../game/room'
import { COLOR, INK, LINE, LINE_DETAIL, heartPath, lw, sparklePath, starPath, toWorld, type View } from './look'
import { drawBlock } from './things'
import { ROOM_LOOK, pitSurface } from './world'

/**
 * Particles the sim's events set off: dust, sparkles, rings, droplets, cookie bits,
 * hearts, confetti, and the stars that fly to the HUD's star counter. Visual only, so
 * Math.random is fine here. A fixed pool reused from the oldest: nothing is allocated per
 * frame. Colours come from COLOR (look.ts), a room's own (ROOM_LOOK) or the art itself:
 * cookie bits are windows onto the cookie block's own drawing.
 */

/** How many particles can be alive at once; past that the oldest makes way. */
const POOL = 256
/** At most this many stars fly to the counter at once; past that a star counts without flying. */
const STARS_MAX = 20

/** A dust puff: its radius grows from PUFF_R0 to PUFF_R1 while it fades from PUFF_ALPHA over PUFF_FOR, rising PUFF_RISE tiles/s. */
const PUFF_R0 = 0.08
const PUFF_R1 = 0.22
const PUFF_ALPHA = 0.8
const PUFF_FOR = 0.3
const PUFF_RISE = 0.6
/** A sparkle is SPARKLE_MIN to SPARKLE_MAX from tip to tip and scales in and out over SPARKLE_FOR. */
const SPARKLE_MIN = 0.12
const SPARKLE_MAX = 0.25
const SPARKLE_FOR = 0.35
/** A power-up's ring of sparkles: this many, this far from the middle. */
const RING_SPARKLES = 10
const RING_SPARKLES_R = 0.8
/** A stomp's ring: radius and line width at the start and the end, and how long. A kick, a knock or a catch makes the small one. */
const STOMP_RING = [0.15, 0.7, 0.08, 0.01, 0.22] as const
const SMALL_RING = [0.1, 0.45, 0.06, 0.01, 0.2] as const
/** A popped bubble: its ring, and this many droplets flying off. */
const POP_RING = [0.2, 0.75, 0.06, 0.01, 0.25] as const
const DROPS = 8
/** A star earned flies to the counter over STAR_FLY, STAR_R in radius; a gift star first pops GIFT_POP tiles up out of its box over GIFT_POP_FOR. Stars paid together leave STAR_EVERY apart. */
const STAR_FLY = 0.5
const STAR_R = 0.2
const GIFT_POP = 1.5
const GIFT_POP_FOR = 0.3
const STAR_EVERY = 0.08
/** Hearts rise HEART_RISE over HEART_FOR, swaying HEART_SWAY at HEART_HZ, HEART_SIZE wide, HEART_EVERY apart. */
const HEART_RISE = 1.5
const HEART_FOR = 1.2
const HEART_SWAY = 0.15
const HEART_HZ = 1.5
const HEART_SIZE = 0.32
const HEART_EVERY = 0.15
/** Confetti: a piece CONFETTI_W by CONFETTI_H, thrown up and out, falling under CONFETTI_G with CONFETTI_DRAG, spinning, for CONFETTI_FOR. */
const CONFETTI_W = 0.07
const CONFETTI_H = 0.14
const CONFETTI_G = 14
const CONFETTI_DRAG = 1.5
const CONFETTI_FOR = 2.5
/** A broken cookie block: four quarters fly off and fade by BITS_FOR, and crumbs this big; a small bump knocks BUMP_CRUMBS loose. */
const QUARTER_VX = 3
const QUARTER_G = 30
const QUARTER_SPIN = 8
const BITS_FOR = 0.6
const CRUMB_R = [0.035, 0.065] as const
const BREAK_CRUMBS = 8
const BUMP_CRUMBS = 3
/** A fall's splash: droplets thrown up from the surface and a flat ring on it; the Toy Room throws balls, the Roof lets fireflies out. */
const SPLASH_DROPS = 6
const SPLASH_G = 30
const SPLASH_RING = [0.2, 1.1] as const
const BALLS = 6
const BALL_R = 0.17
const BALL_BOUNCE = 0.45
const FIREFLIES = 10
const FIREFLY_FOR = 1.6

/** What a particle is: how it moves and how it is drawn. */
type Kind = 'puff' | 'sparkle' | 'ring' | 'splash' | 'drop' | 'quarter' | 'crumb' | 'confetti' | 'heart' | 'ball' | 'firefly' | 'star'

/** One particle of the pool: dead once its age reaches its life. */
interface Particle {
  kind: Kind
  /** Seconds since it was set off (below 0 while it waits its turn), and how long it lasts. */
  age: number
  life: number
  /** Where it is in world units (a heart: where it rose from; a star: where it took off) and how it moves (tiles/s, + is down). */
  x: number
  y: number
  vx: number
  vy: number
  /** Gravity (tiles/s²) and drag (per second). */
  g: number
  drag: number
  /** Its size at the start and at the end: a radius, a sparkle from tip to tip, a ring's radius. */
  size0: number
  size1: number
  /** A ring's line width at the start and the end; a gift star's pop height in w0. */
  w0: number
  w1: number
  /** Its turn and how fast it turns (radians, radians/s). */
  angle: number
  spin: number
  colour: string
  /** A cookie bit: the block it broke off, and the point of the block's cell it shows (cell units). A ball: the surface it bounces on, in oy. A heart: its sway's phase, in ox. */
  block: number
  ox: number
  oy: number
}

/** A random number from a to b. */
const rand = (a: number, b: number) => a + (b - a) * Math.random()
/** A full turn in radians. */
const TAU = Math.PI * 2

/** Every particle on the stage: `spawn` sets them off from the sim's events (and `dust`, `hearts` and `confetti` from what the stage sees), `update` moves them and `draw` draws them. */
export class Effects {
  private pool: Particle[] = Array.from({ length: POOL }, () => ({
    kind: 'puff',
    age: 0,
    life: 0,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    g: 0,
    drag: 0,
    size0: 0,
    size1: 0,
    w0: 0,
    w1: 0,
    angle: 0,
    spin: 0,
    colour: COLOR.dust,
    block: -1,
    ox: 0,
    oy: 0,
  }))
  private next = 0
  /** Stars flying to the counter right now. */
  private flying = 0

  /** Forgets every particle: a new visit. */
  clear(): void {
    for (const p of this.pool) p.age = p.life = 0
    this.flying = 0
  }

  /** The next slot, taken from the oldest particle: a particle with its motion, size and colour reset, set off after `wait` seconds. */
  private take(kind: Kind, x: number, y: number, life: number, wait: number): Particle {
    const p = this.pool[this.next]!
    this.next = (this.next + 1) % POOL
    if (p.kind === 'star' && p.age < p.life) this.flying -= 1
    p.kind = kind
    p.age = -wait
    p.life = life
    p.x = x
    p.y = y
    p.vx = p.vy = p.g = p.drag = p.angle = p.spin = p.ox = p.oy = 0
    p.size0 = p.size1 = p.w0 = p.w1 = 0
    p.colour = COLOR.sparkle
    p.block = -1
    return p
  }

  /** A puff of dust at (x, y) drifting `vx` along x, `size` of a full one: a jump, a landing, a running or skidding foot. */
  dust(x: number, y: number, vx: number, size: number): void {
    const p = this.take('puff', x, y, PUFF_FOR, 0)
    p.vx = vx
    p.vy = -PUFF_RISE
    p.size0 = PUFF_R0 * size
    p.size1 = PUFF_R1 * size
    p.colour = COLOR.dust
  }

  /** A four-point sparkle at (x, y) after `wait`, white or warm. */
  private sparkle(x: number, y: number, wait: number): Particle {
    const p = this.take('sparkle', x, y, SPARKLE_FOR, wait)
    p.size0 = rand(SPARKLE_MIN, SPARKLE_MAX)
    p.colour = Math.random() < 0.5 ? COLOR.sparkle : COLOR.sparkleWarm
    return p
  }

  /** A stroked ring at (x, y) growing from r0 to r1 while its line thins from w0 to w1, for `life` seconds. */
  private ring(x: number, y: number, [r0, r1, w0, w1, life]: readonly [number, number, number, number, number], colour: string): void {
    const p = this.take('ring', x, y, life, 0)
    p.size0 = r0
    p.size1 = r1
    p.w0 = w0
    p.w1 = w1
    p.colour = colour
  }

  /** `n` droplets bursting out of (x, y) in every direction. */
  private drops(x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rand(-0.3, 0.3)
      const speed = rand(2.5, 4.5)
      const p = this.take('drop', x, y, rand(0.4, 0.55), 0)
      p.vx = Math.cos(a) * speed
      p.vy = Math.sin(a) * speed - 1.5
      p.g = 18
      p.size0 = p.size1 = rand(0.045, 0.07)
      p.colour = COLOR.droplet
    }
  }

  /** A star earned at (x, y) flying to the counter after `wait`, popping `pop` tiles up first. */
  private star(x: number, y: number, pop: number, wait: number): void {
    if (this.flying >= STARS_MAX) return
    const p = this.take('star', x, y, (pop > 0 ? GIFT_POP_FOR : 0) + STAR_FLY, wait)
    p.w0 = pop
    this.flying += 1
  }

  /** `n` stars leaving (x, y) one after another. */
  private stars(x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) this.star(x + rand(-0.2, 0.2), y, 0, i * STAR_EVERY)
  }

  /** Hearts rising from (x, y), one after another. */
  hearts(x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const p = this.take('heart', x + rand(-0.25, 0.25), y, HEART_FOR, i * HEART_EVERY)
      p.ox = rand(0, TAU)
    }
  }

  /** `n` pieces of confetti thrown up and out of (x, y). */
  confetti(x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const p = this.take('confetti', x + rand(-0.3, 0.3), y + rand(-0.3, 0.3), CONFETTI_FOR * rand(0.8, 1), 0)
      p.vx = rand(-4, 4)
      p.vy = rand(-12, -6)
      p.g = CONFETTI_G
      p.drag = CONFETTI_DRAG
      p.spin = rand(6, 14) * (Math.random() < 0.5 ? -1 : 1)
      p.angle = rand(0, TAU)
      // The tilt of the piece in its own plane, turning slower than the flip.
      p.ox = rand(0, TAU)
      p.colour = COLOR.confetti[i % COLOR.confetti.length]!
    }
  }

  /** `n` crumbs of cookie block `block` knocked loose at (x, y), thrown up to `up` tiles/s. */
  private crumbs(block: number, x: number, y: number, n: number, up: number): void {
    for (let i = 0; i < n; i++) {
      const p = this.take('crumb', x + rand(-0.3, 0.3), y + rand(-0.15, 0.15), BITS_FOR * rand(0.7, 1), 0)
      p.vx = rand(-3, 3)
      p.vy = rand(-up, -up * 0.3)
      p.g = QUARTER_G
      p.spin = rand(-6, 6)
      p.size0 = p.size1 = rand(CRUMB_R[0], CRUMB_R[1])
      p.block = block
      p.ox = rand(0.15, 0.85)
      p.oy = rand(0.15, 0.85)
    }
  }

  /** Sets off what event `e` calls for. */
  spawn(e: SimEvent, room: Room): void {
    const { x, y } = e
    switch (e.kind) {
      case 'jump':
        this.dust(x - 0.15, y, -0.6, 0.7)
        this.dust(x + 0.15, y, 0.6, 0.7)
        return
      case 'land':
        this.dust(x - 0.25, y, -0.9, 1)
        this.dust(x + 0.25, y, 0.9, 1)
        return
      case 'star':
        this.star(x, y, 0, 0)
        this.sparkle(x, y, 0)
        return
      case 'giftStar':
        this.star(x, y, GIFT_POP, 0)
        return
      case 'pole':
        this.stars(x, y, e.n)
        return
      case 'bump': {
        // Her head knocked the block's bottom: the sparkle is there.
        this.sparkle(x, y + 1.05, 0)
        const block = room.blockAt[Math.floor(y) * room.cols + Math.floor(x)]!
        if (block >= 0 && room.blocks[block]!.kind === 'cookie') this.crumbs(block, x, y + 1, BUMP_CRUMBS, 2)
        return
      }
      case 'break': {
        const col = Math.floor(x)
        const row = Math.floor(y)
        const block = room.blockAt[row * room.cols + col]!
        if (block < 0 || room.blocks[block]!.kind !== 'cookie') throw new Error(`room ${room.id}: a cookie block broke at column ${col}, row ${row}, where there is none`)
        for (let i = 0; i < 4; i++) {
          const qx = i % 2 === 0 ? 0.25 : 0.75
          const qy = i < 2 ? 0.25 : 0.75
          const side = qx < 0.5 ? -1 : 1
          const p = this.take('quarter', col + qx, row + qy, BITS_FOR, 0)
          p.vx = side * QUARTER_VX * rand(0.8, 1.1)
          p.vy = qy < 0.5 ? rand(-10, -9) : rand(-8.5, -8)
          p.g = QUARTER_G
          p.spin = side * QUARTER_SPIN
          p.block = block
          p.ox = qx
          p.oy = qy
        }
        this.crumbs(block, x, y, BREAK_CRUMBS, 8)
        return
      }
      case 'sprout':
      case 'grow':
      case 'wand':
      case 'ball': {
        // A power-up rising out of its box: the ring goes round where it comes out.
        const cy = e.kind === 'sprout' ? y - 0.35 : y
        for (let i = 0; i < RING_SPARKLES; i++) {
          const a = (i / RING_SPARKLES) * TAU
          const p = this.sparkle(x + Math.cos(a) * RING_SPARKLES_R, cy + Math.sin(a) * RING_SPARKLES_R, i * 0.015)
          p.vx = Math.cos(a) * 0.8
          p.vy = Math.sin(a) * 0.8
        }
        return
      }
      case 'shrink':
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU + 0.3
          const p = this.take('puff', x + Math.cos(a) * 0.35, y + Math.sin(a) * 0.45, PUFF_FOR * 1.4, 0)
          p.vx = Math.cos(a) * 1.4
          p.vy = Math.sin(a) * 1.4 - PUFF_RISE
          p.size0 = PUFF_R0 * 1.4
          p.size1 = PUFF_R1 * 1.4
          p.colour = COLOR.dust
        }
        return
      case 'stomp':
        this.ring(x, y, STOMP_RING, COLOR.sparkle)
        this.stars(x, y - 0.2, e.n)
        return
      case 'kick':
      case 'knock':
        this.ring(x, y, SMALL_RING, COLOR.sparkle)
        this.sparkle(x, y - 0.3, 0)
        return
      case 'trap':
        this.ring(x, y, SMALL_RING, COLOR.bubbleRim)
        this.sparkle(x + 0.3, y - 0.3, 0)
        return
      case 'shellPop':
        this.ring(x, y, STOMP_RING, COLOR.sparkle)
        this.sparkle(x, y, 0)
        this.stars(x, y, e.n)
        return
      case 'pop':
      case 'rescued':
        this.ring(x, y, POP_RING, COLOR.bubbleRim)
        this.drops(x, y, DROPS)
        return
      case 'fall':
        this.splash(room, x)
        return
      case 'kitten':
        // Out of the bed's doorway.
        this.hearts(x, y - 0.6, 3)
        return
      case 'done':
      case 'bossDown':
        this.confetti(x, y - 0.5, 60)
        return
      case 'gate':
        for (let i = 0; i < 3; i++) {
          const p = this.sparkle(x + rand(-0.4, 0.4), y + rand(-0.4, 0.4), rand(0, 0.4))
          p.vy = -0.6
        }
        return
      default:
        return
    }
  }

  /** She fell into the gap at x: a splash on its surface, balls out of the Toy Room's ball pit, fireflies out of the Roof's night air. */
  private splash(room: Room, x: number): void {
    const gap = gapAt(room, Math.floor(x))
    if (gap < 0) throw new Error(`room ${room.id}: she fell at column ${Math.floor(x)}, where there is no gap`)
    const surface = pitSurface(room, room.gaps[gap]!)
    if (room.id === 'toys') {
      const colours = ROOM_LOOK.toys.pitBits
      for (let i = 0; i < BALLS; i++) {
        const p = this.take('ball', x + rand(-0.4, 0.4), surface, rand(1.1, 1.4), 0)
        p.vx = rand(-2.5, 2.5)
        p.vy = rand(-11, -8)
        p.g = SPLASH_G
        p.size0 = p.size1 = BALL_R
        p.oy = surface
        p.colour = colours[i % colours.length]!
      }
      return
    }
    if (room.id === 'roof') {
      for (let i = 0; i < FIREFLIES; i++) {
        const p = this.take('firefly', x + rand(-0.6, 0.6), surface + rand(0, 0.8), FIREFLY_FOR * rand(0.7, 1), rand(0, 0.25))
        p.vx = rand(-1.5, 1.5)
        p.vy = rand(-2.6, -1.2)
        p.drag = 0.9
        p.ox = rand(0, TAU)
        p.colour = ROOM_LOOK.roof.pitBits[0]!
      }
      return
    }
    for (let i = 0; i < SPLASH_DROPS; i++) {
      const p = this.take('drop', x + rand(-0.3, 0.3), surface, rand(0.5, 0.65), 0)
      p.vx = rand(-2, 2)
      p.vy = rand(-10, -7)
      p.g = SPLASH_G
      p.size0 = p.size1 = rand(0.05, 0.08)
      p.colour = COLOR.droplet
    }
    const p = this.take('splash', x, surface, 0.45, 0)
    p.size0 = SPLASH_RING[0]
    p.size1 = SPLASH_RING[1]
    p.w0 = 0.07
    p.w1 = 0.02
  }

  /** Moves every particle on by dt seconds. */
  update(dt: number): void {
    if (dt <= 0) return
    for (let i = 0; i < POOL; i++) {
      const p = this.pool[i]!
      if (p.age >= p.life) continue
      p.age += dt
      if (p.age >= p.life) {
        if (p.kind === 'star') this.flying -= 1
        continue
      }
      // Waiting its turn, or placed by its age alone.
      if (p.age < 0 || p.kind === 'star' || p.kind === 'heart') continue
      p.vy += p.g * dt
      if (p.drag > 0) {
        const k = Math.exp(-p.drag * dt)
        p.vx *= k
        p.vy *= k
      }
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.angle += p.spin * dt
      if (p.kind === 'ball' && p.y > p.oy && p.vy > 0) {
        p.y = p.oy
        p.vy *= -BALL_BOUNCE
      }
    }
  }

  /**
   * Draws every particle: the world's in world units for the view, then the stars flying
   * to the counter at (counterX, counterY) in device pixels. `still` is a sim whose blocks
   * are whole (cookie bits are drawn from it), `t` the picture's time. Leaves the context's
   * transform at identity and its alpha at 1.
   */
  draw(ctx: CanvasRenderingContext2D, v: View, room: Room, still: Sim, t: number, counterX: number, counterY: number): void {
    toWorld(ctx, v)
    for (let i = 0; i < POOL; i++) {
      const p = this.pool[i]!
      if (p.age < 0 || p.age >= p.life || p.kind === 'star') continue
      const u = p.age / p.life
      switch (p.kind) {
        case 'puff': {
          ctx.globalAlpha = PUFF_ALPHA * (1 - u)
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size0 + (p.size1 - p.size0) * u, 0, TAU)
          ctx.fillStyle = p.colour
          ctx.fill()
          break
        }
        case 'sparkle': {
          ctx.globalAlpha = 1
          sparklePath(ctx, p.x, p.y, p.size0 * Math.sin(Math.PI * u))
          ctx.fillStyle = p.colour
          ctx.fill()
          break
        }
        case 'ring':
        case 'splash': {
          const k = 1 - (1 - u) * (1 - u)
          const r = p.size0 + (p.size1 - p.size0) * k
          ctx.globalAlpha = p.kind === 'ring' ? 1 - u * u : 0.9 * (1 - u)
          ctx.beginPath()
          if (p.kind === 'ring') ctx.arc(p.x, p.y, r, 0, TAU)
          else ctx.ellipse(p.x, p.y, r, r * 0.28, 0, 0, TAU)
          ctx.lineWidth = lw(p.w0 + (p.w1 - p.w0) * u)
          ctx.strokeStyle = p.colour
          ctx.stroke()
          break
        }
        case 'drop': {
          ctx.globalAlpha = u < 0.7 ? 1 : (1 - u) / 0.3
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size0, 0, TAU)
          ctx.fillStyle = p.colour
          ctx.fill()
          break
        }
        case 'quarter':
        case 'crumb': {
          ctx.globalAlpha = u < 0.65 ? 1 : (1 - u) / 0.35
          ctx.save()
          ctx.translate(p.x, p.y)
          ctx.rotate(p.angle)
          ctx.beginPath()
          if (p.kind === 'quarter') ctx.rect(-0.25, -0.25, 0.5, 0.5)
          else ctx.arc(0, 0, p.size0, 0, TAU)
          ctx.clip()
          ctx.translate(-p.ox, -p.oy)
          drawBlock(ctx, room, p.block, still, t)
          ctx.restore()
          break
        }
        case 'confetti': {
          ctx.globalAlpha = u < 0.8 ? 1 : (1 - u) / 0.2
          // The piece flips over as it spins (its width runs through cos) and tilts slowly in its own plane.
          const hw = (CONFETTI_W / 2) * Math.cos(p.angle)
          const hh = CONFETTI_H / 2
          const tilt = p.ox + p.angle * 0.3
          const c = Math.cos(tilt)
          const s = Math.sin(tilt)
          ctx.beginPath()
          ctx.moveTo(p.x - hw * c + hh * s, p.y - hw * s - hh * c)
          ctx.lineTo(p.x + hw * c + hh * s, p.y + hw * s - hh * c)
          ctx.lineTo(p.x + hw * c - hh * s, p.y + hw * s + hh * c)
          ctx.lineTo(p.x - hw * c - hh * s, p.y - hw * s + hh * c)
          ctx.closePath()
          ctx.fillStyle = p.colour
          ctx.fill()
          break
        }
        case 'heart': {
          ctx.globalAlpha = u < 0.6 ? 1 : (1 - u) / 0.4
          const x = p.x + HEART_SWAY * Math.sin(TAU * HEART_HZ * p.age + p.ox)
          const y = p.y - HEART_RISE * (1 - (1 - u) * (1 - u))
          heartPath(ctx, x, y, HEART_SIZE * Math.min(1, 0.4 + u * 4))
          ctx.fillStyle = COLOR.heart
          ctx.fill()
          ctx.lineWidth = lw(LINE_DETAIL)
          ctx.strokeStyle = INK
          ctx.stroke()
          break
        }
        case 'ball': {
          ctx.globalAlpha = u < 0.75 ? 1 : (1 - u) / 0.25
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size0, 0, TAU)
          ctx.fillStyle = p.colour
          ctx.fill()
          ctx.beginPath()
          ctx.ellipse(p.x - p.size0 * 0.4, p.y - p.size0 * 0.45, p.size0 * 0.25, p.size0 * 0.12, -0.6, 0, TAU)
          ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
          ctx.fill()
          break
        }
        case 'firefly': {
          const glow = 0.5 + 0.5 * Math.sin(p.age * 9 + p.ox)
          const fade = u < 0.2 ? u / 0.2 : u > 0.7 ? (1 - u) / 0.3 : 1
          ctx.fillStyle = p.colour
          ctx.globalAlpha = 0.3 * glow * fade
          ctx.beginPath()
          ctx.arc(p.x, p.y, 0.13, 0, TAU)
          ctx.fill()
          ctx.globalAlpha = (0.4 + 0.6 * glow) * fade
          ctx.beginPath()
          ctx.arc(p.x, p.y, 0.045, 0, TAU)
          ctx.fill()
          break
        }
      }
    }
    ctx.globalAlpha = 1
    // The stars, in device pixels: up from where she earned them, then curving into the counter.
    for (let i = 0; i < POOL; i++) {
      const p = this.pool[i]!
      if (p.kind !== 'star' || p.age < 0 || p.age >= p.life) continue
      const pop = p.w0 > 0 ? GIFT_POP_FOR : 0
      const rise = pop > 0 ? Math.min(1, p.age / pop) : 1
      const sx = (p.x - v.left) * v.tile
      const sy = v.top + (p.y - p.w0 * (1 - (1 - rise) * (1 - rise))) * v.tile
      const u = Math.max(0, p.age - pop) / STAR_FLY
      const k = u * u
      // A quadratic curve whose control point sits straight above the start, level with the counter.
      const cy = Math.min(sy, counterY)
      const x = (1 - k) * (1 - k) * sx + 2 * k * (1 - k) * sx + k * k * counterX
      const y = (1 - k) * (1 - k) * sy + 2 * k * (1 - k) * cy + k * k * counterY
      const grow = 1 + 0.35 * Math.max(0, 1 - p.age / 0.12)
      ctx.setTransform(v.tile, 0, 0, v.tile, x, y)
      starPath(ctx, 0, 0, STAR_R * grow)
      ctx.fillStyle = COLOR.star
      ctx.fill()
      ctx.lineWidth = lw(LINE)
      ctx.lineJoin = 'round'
      ctx.strokeStyle = INK
      ctx.stroke()
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0)
  }
}
