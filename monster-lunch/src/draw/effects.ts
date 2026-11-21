import type { Edible, FeedEvent, Food, Hue, SimEvent } from '../game/model'
import { drawFood } from './foods'
import { C, HUE, LINE_DETAIL, lw, INK } from './look'

/** The particles' own colours. */
const FX = {
  dust: 'rgba(255, 248, 230, 0.9)',
  water: '#BFF0FF',
  waterRing: 'rgba(255, 255, 255, 0.85)',
  crumb: '#D9A35B',
  stink: 'rgba(150, 200, 90, 0.75)',
  smoke: 'rgba(255, 255, 255, 0.8)',
  flame: '#FFB547',
  bubble: 'rgba(255, 255, 255, 0.9)',
} as const

type Kind = 'spark' | 'dust' | 'drop' | 'confetti' | 'heart' | 'ring' | 'float' | 'crumb' | 'puff' | 'bubble'

/** One particle, in world (or scene) units: where, how fast, for how long, and what it looks like. */
interface Particle {
  kind: Kind
  x: number
  y: number
  vx: number
  vy: number
  /** Downward pull, tiles a second squared. */
  g: number
  age: number
  life: number
  size: number
  colour: string
  spin: number
  food: Food | null
}

const MAX = 400

/**
 * The particles the sims' events set off: sparkles for a pick, dust where a food lands, a
 * splash and floating food where something falls in, confetti for a flag and the finish,
 * crumbs and hearts for a chomp. Pure decoration: nothing here touches the sims. Positions
 * are in the units of whatever the renderer draws them over (course tiles or scene tiles).
 */
export class Effects {
  private list: Particle[] = []
  /** A seeded wobble for spreads, so two bursts never look alike but a test sees the same. */
  private seed = 7

  clear() {
    this.list.length = 0
  }

  get count() {
    return this.list.length
  }

  private rand() {
    this.seed = (this.seed * 16807) % 2147483647
    return this.seed / 2147483647
  }

  private add(p: Omit<Particle, 'age' | 'spin' | 'food'> & { food?: Food; spin?: number }) {
    if (this.list.length >= MAX) this.list.shift()
    this.list.push({ age: 0, spin: p.spin ?? 0, food: p.food ?? null, ...p })
  }

  /** `n` of a kind bursting from (x, y) at speeds up to `speed`, upward-biased by `up`. */
  private burst(kind: Kind, n: number, x: number, y: number, speed: number, up: number, life: number, size: number, colours: readonly string[], g: number) {
    for (let i = 0; i < n; i++) {
      const a = this.rand() * Math.PI * 2
      const v = speed * (0.4 + 0.6 * this.rand())
      this.add({ kind, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - up, g, life: life * (0.7 + 0.6 * this.rand()), size: size * (0.7 + 0.6 * this.rand()), colour: colours[i % colours.length]!, spin: (this.rand() - 0.5) * 10 })
    }
  }

  private splash(x: number, y: number, big: boolean) {
    this.add({ kind: 'ring', x, y, vx: 0, vy: 0, g: 0, life: big ? 0.9 : 0.6, size: big ? 0.9 : 0.5, colour: FX.waterRing })
    this.burst('drop', big ? 14 : 6, x, y - 0.1, big ? 3 : 2, big ? 3.2 : 2.2, 0.6, 0.07, [FX.water], 9)
  }

  /** Foods floating off on the water after a fall: they drift and bob, then sink away. */
  private floaters(foods: readonly Edible[], x: number, y: number) {
    foods.forEach((f) => {
      const a = this.rand() * Math.PI * 2
      this.add({ kind: 'float', x: x + Math.cos(a) * 0.3, y: y + Math.sin(a) * 0.2, vx: Math.cos(a) * 0.6, vy: Math.sin(a) * 0.4, g: 0, life: 2.6 + this.rand(), size: 0.85, colour: FX.waterRing, food: f })
    })
  }

  /** The course's events. `pileTop` is where the top of her pile was drawn, for the bonk's spray. */
  course(e: SimEvent, heroX: number, heroY: number, pileTop: number) {
    switch (e.kind) {
      case 'pick':
        if (e.food === 'poop') this.burst('puff', 5, heroX, heroY - pileTop, 0.6, 0.6, 0.9, 0.16, [FX.stink], -0.4)
        else this.burst('spark', 6, heroX, heroY - pileTop, 1.6, 0.8, 0.5, 0.09, [C.sparkle, C.sparkleWarm, C.star], 2)
        break
      case 'bonk':
        this.burst('spark', 10, heroX, heroY - 0.8, 3, 0.5, 0.45, 0.1, [C.sparkle, C.star], 0)
        break
      case 'land':
        this.burst('dust', 5, e.x, e.y, 1, 0.3, 0.45, 0.12, [FX.dust], 0)
        break
      case 'sink':
        this.splash(e.x, e.y, false)
        break
      case 'splash':
        this.splash(e.x, e.y, true)
        this.floaters(e.foods, e.x, e.y)
        this.burst('bubble', 6, e.x, e.y, 0.6, 0.8, 1.2, 0.08, [FX.bubble], -0.5)
        break
      case 'back':
        this.burst('spark', 12, e.x, e.y - 0.6, 2, 0.6, 0.6, 0.1, [C.sparkle, C.sparkleWarm], 0)
        break
      case 'press':
        this.add({ kind: 'ring', x: e.x, y: e.y, vx: 0, vy: 0, g: 0, life: 0.5, size: 0.7, colour: HUE[e.hue].light })
        break
      case 'zap':
        this.burst('spark', 10, heroX, heroY - 0.7, 2.6, 0.4, 0.35, 0.08, [C.zap, C.white], 0)
        break
      case 'flag':
        this.burst('confetti', 18, e.x, e.y - 1.4, 2.4, 2.4, 1.2, 0.09, C.confetti, 4)
        break
      case 'puppy':
        this.burst('dust', 3, e.x, e.y, 0.5, 0.2, 0.4, 0.1, [FX.dust], 0)
        break
      case 'finish':
        this.burst('confetti', 30, heroX, heroY - 2, 3.5, 3, 1.6, 0.1, C.confetti, 4)
        break
      case 'bread':
        this.burst('spark', 18, heroX, heroY - pileTop * 0.6, 2.4, 0.6, 0.8, 0.12, [C.sparkle, C.star, C.sparkleWarm], 0)
        this.burst('heart', 4, heroX, heroY - pileTop, 0.8, 1.2, 1.2, 0.18, [C.heart], -0.5)
        break
      case 'liftoff':
        this.burst('puff', 8, heroX, heroY, 1.4, 0.2, 1, 0.22, [FX.smoke], -0.6)
        break
      default:
        break
    }
  }

  /** The gate's own sparkle as it opens, tile by tile. */
  gate(hue: Hue, x: number, y: number) {
    this.burst('spark', 4, x, y - 0.4, 1.4, 0.8, 0.5, 0.09, [HUE[hue].light, C.white], 1)
  }

  /** The finale's events, in scene units; `mouthY` is the line the monster catches at. */
  feed(e: FeedEvent, mouthY: number, monsterX: number) {
    switch (e.kind) {
      case 'chomp':
        this.burst('crumb', 7, e.x, mouthY, 2.2, 1.2, 0.6, 0.07, [FX.crumb, C.white], 7)
        if (e.n > 0 && e.n % 3 === 0) this.burst('heart', 2, e.x, mouthY - 0.8, 0.8, 1.4, 1.2, 0.22, [C.heart], -0.6)
        break
      case 'bleh':
        this.burst('puff', 6, e.x, mouthY, 1, 0.6, 1, 0.2, [FX.stink], -0.4)
        break
      case 'miss':
        this.burst('crumb', 6, e.x, mouthY + 1.35, 1.8, 1.5, 0.5, 0.06, [FX.crumb], 8)
        break
      case 'full':
        this.burst('confetti', 40, monsterX, mouthY - 2, 4, 3, 2, 0.12, C.confetti, 4)
        break
      case 'burp':
        this.add({ kind: 'ring', x: monsterX, y: mouthY, vx: 0, vy: -0.5, g: 0, life: 0.8, size: 1, colour: FX.smoke })
        break
      case 'stars':
        this.burst('confetti', 30, monsterX, mouthY - 3, 4, 2, 2, 0.12, C.confetti, 3)
        break
      default:
        break
    }
  }

  /** Burner puffs over the balloon while it flies. */
  burner(x: number, y: number) {
    this.add({ kind: 'puff', x, y, vx: (this.rand() - 0.5) * 0.3, vy: -0.6, g: 0, life: 0.6, size: 0.12, colour: FX.flame })
  }

  step(dt: number) {
    for (const p of this.list) {
      p.age += dt
      p.vy += p.g * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      if (p.kind === 'float' || p.kind === 'dust' || p.kind === 'puff') {
        p.vx *= Math.exp(-2 * dt)
        p.vy *= Math.exp(-2 * dt)
      }
    }
    this.list = this.list.filter((p) => p.age < p.life)
  }

  /** Draws every particle in the context's current units, at time `t` seconds. */
  draw(ctx: CanvasRenderingContext2D, t: number) {
    for (const p of this.list) {
      const k = p.age / p.life
      const fade = k > 0.7 ? (1 - k) / 0.3 : 1
      ctx.save()
      ctx.globalAlpha = Math.max(0, Math.min(1, fade))
      ctx.translate(p.x, p.y)
      switch (p.kind) {
        case 'spark': {
          ctx.rotate(p.spin * p.age)
          const r = p.size * (1 - k * 0.5)
          ctx.beginPath()
          for (let i = 0; i < 8; i++) {
            const a = (i * Math.PI) / 4
            const d = i % 2 === 0 ? r : r * 0.35
            if (i === 0) ctx.moveTo(Math.cos(a) * d, Math.sin(a) * d)
            else ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d)
          }
          ctx.closePath()
          ctx.fillStyle = p.colour
          ctx.fill()
          break
        }
        case 'confetti':
          ctx.rotate(p.spin * p.age)
          ctx.scale(1, Math.abs(Math.cos(p.spin * p.age * 0.7)) + 0.2)
          ctx.fillStyle = p.colour
          ctx.fillRect(-p.size, -p.size * 0.5, p.size * 2, p.size)
          break
        case 'heart': {
          const r = p.size
          ctx.beginPath()
          ctx.moveTo(0, r * 0.9)
          ctx.bezierCurveTo(-r * 1.4, -r * 0.1, -r * 0.6, -r * 1.1, 0, -r * 0.35)
          ctx.bezierCurveTo(r * 0.6, -r * 1.1, r * 1.4, -r * 0.1, 0, r * 0.9)
          ctx.fillStyle = p.colour
          ctx.fill()
          ctx.lineWidth = lw(LINE_DETAIL)
          ctx.strokeStyle = INK
          ctx.stroke()
          break
        }
        case 'ring':
          ctx.beginPath()
          ctx.ellipse(0, 0, p.size * (0.4 + k), p.size * (0.4 + k) * 0.45, 0, 0, Math.PI * 2)
          ctx.lineWidth = lw(0.05 * (1 - k) + 0.01)
          ctx.strokeStyle = p.colour
          ctx.stroke()
          break
        case 'float': {
          // Bobbing on its own ring of ripples, sinking a little lower as it drifts off.
          const s = p.size * (1 - k * 0.35)
          ctx.beginPath()
          ctx.ellipse(0, 0, s * 0.62, s * 0.2, 0, 0, Math.PI * 2)
          ctx.lineWidth = lw(0.03)
          ctx.strokeStyle = p.colour
          ctx.stroke()
          ctx.translate(0, Math.sin(t * 3 + p.spin) * 0.04 + k * 0.12)
          ctx.scale(s, s)
          ctx.rotate(Math.sin(t * 2 + p.spin) * 0.15)
          drawFood(ctx, p.food!, t)
          break
        }
        case 'bubble':
          ctx.beginPath()
          ctx.arc(0, 0, p.size, 0, Math.PI * 2)
          ctx.lineWidth = lw(0.02)
          ctx.strokeStyle = p.colour
          ctx.stroke()
          break
        case 'dust':
        case 'puff':
        case 'drop':
        case 'crumb':
          ctx.beginPath()
          ctx.arc(0, 0, p.size * (p.kind === 'puff' || p.kind === 'dust' ? 0.6 + k : 1), 0, Math.PI * 2)
          ctx.fillStyle = p.colour
          ctx.fill()
          break
      }
      ctx.restore()
    }
  }
}
