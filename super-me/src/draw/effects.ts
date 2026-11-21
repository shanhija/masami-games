import { COLOR, sparklePath } from '../../../pia-jump/src/draw/look'
import type { SimEvent } from '../game/model'

/**
 * The particles over a level, set off by the sim's events: dust at a jump and a landing,
 * sparkles round a crate taken and a block put down, a grey puff where a block does not
 * fit, confetti out of a present and at the finish. Pia Jump's Effects reads Pia Jump's own
 * sim, so this small pool is Super Me's. World units, y down.
 */

type Kind = 'dust' | 'sparkle' | 'confetti' | 'nope'

interface Particle {
  kind: Kind
  age: number
  life: number
  x: number
  y: number
  vx: number
  vy: number
  g: number
  size: number
  spin: number
  colour: string
}

const POOL = 160
const rand = (a: number, b: number) => a + (b - a) * Math.random()

export class Effects {
  private pool: Particle[] = Array.from({ length: POOL }, () => ({ kind: 'dust', age: 0, life: 0, x: 0, y: 0, vx: 0, vy: 0, g: 0, size: 0, spin: 0, colour: COLOR.dust }))
  private next = 0

  clear(): void {
    for (const p of this.pool) p.age = p.life = 0
  }

  private take(kind: Kind, x: number, y: number, life: number, colour: string): Particle {
    const p = this.pool[this.next]!
    this.next = (this.next + 1) % POOL
    Object.assign(p, { kind, age: 0, life, x, y, vx: 0, vy: 0, g: 0, size: 0, spin: 0, colour })
    return p
  }

  /** A puff of dust at (x, y): `size` of a full one. */
  dust(x: number, y: number, size: number): void {
    for (const side of [-1, 1]) {
      const p = this.take('dust', x + side * 0.2, y - 0.05, 0.35, COLOR.dust)
      p.vx = side * 1.2
      p.vy = -0.6
      p.size = 0.16 * size
    }
  }

  private burst(kind: 'sparkle' | 'confetti', x: number, y: number, n: number, speed: number, colours: readonly string[]): void {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand(-0.3, 0.3)
      const p = this.take(kind, x, y, kind === 'confetti' ? rand(0.9, 1.4) : 0.5, colours[i % colours.length]!)
      p.vx = Math.cos(a) * speed * rand(0.6, 1)
      p.vy = Math.sin(a) * speed * rand(0.6, 1) - (kind === 'confetti' ? speed * 0.8 : 0)
      p.g = kind === 'confetti' ? 9 : 0
      p.size = kind === 'confetti' ? 0.13 : 0.24
      p.spin = rand(-8, 8)
    }
  }

  /** Confetti from anywhere: the finish dance throws some every so often. */
  confetti(x: number, y: number): void {
    this.burst('confetti', x, y, 14, 5, COLOR.confetti)
  }

  spawn(e: SimEvent): void {
    switch (e.kind) {
      case 'jump':
        this.dust(e.x, e.y, 0.8)
        break
      case 'land':
        this.dust(e.x, e.y, Math.min(1.4, 0.6 + e.n * 0.2))
        break
      case 'crate':
      case 'build':
      case 'refill':
        this.burst('sparkle', e.x, e.y, 6, 2.5, [COLOR.sparkle, COLOR.sparkleWarm])
        break
      case 'nope': {
        const p = this.take('nope', e.x, e.y - 0.2, 0.5, 'rgba(59, 34, 69, 0.35)')
        p.vy = -0.8
        p.size = 0.3
        break
      }
      case 'present':
        this.burst('confetti', e.x, e.y, 22, 6, COLOR.confetti)
        break
      case 'finish':
        this.burst('confetti', e.x, e.y - 2, 26, 7, COLOR.confetti)
        break
      default:
        break
    }
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (p.age >= p.life) continue
      p.age += dt
      p.vy += p.g * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
    }
  }

  /** Draws every live particle; the context is in world units. */
  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.pool) {
      if (p.age >= p.life) continue
      const u = p.age / p.life
      ctx.globalAlpha = 1 - u * u
      ctx.fillStyle = p.colour
      if (p.kind === 'confetti') {
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.spin * p.age)
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
        ctx.restore()
      } else if (p.kind === 'sparkle') {
        sparklePath(ctx, p.x, p.y, p.size * (1 - u * 0.5))
        ctx.fill()
      } else {
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * (0.6 + u), 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.globalAlpha = 1
  }
}
