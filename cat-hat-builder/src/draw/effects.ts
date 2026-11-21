import { HOUSE_GRID } from '../game/catalog'
import { ITEMS, type ItemSound } from '../game/items'
import { placePoint } from '../game/flights'
import { CELL, MIRROR_BUILDER_X, PLOT_W, PRESENT_X, TRUCK, TRUCK_TIP_X, centre, gridLeft, interiorRect, machineRect, plotLeft, roofRect, slotRect, stackRect } from '../game/layout'
import type { MachineId, PlacedRoom, SimEvent, State, Tool } from '../game/model'
import { BOX, C, INK, MATERIAL_LOOK, RAW_LOOK, TAU, clamp01, lw, sparklePath } from './look'

/**
 * Particles the sim's events set off: dust, stone and wood chips, sparkles, confetti,
 * steam, sawdust, splashes, music notes and the poof of something leaving. They live only
 * in the picture, so Math.random is fine here. Calm and few (look.ts rule 10): a burst is a
 * handful, nothing flashes, and they fade by shrinking rather than by blinking. A fixed pool
 * reused from the oldest, so nothing is allocated per frame. Each particle belongs to one of
 * the two worlds and is drawn only in its own.
 */

/** The renderer's own moments that particles wait for: the crane lowers a new crate onto its pad over CRATE_DROP, the bulldozer crosses a new plot over BULLDOZE. */
export const CRATE_DROP = 1.0
export const BULLDOZE = 2.4

export type World = 'street' | 'road'

/** A room by id with its plot: in the keep, or taken back and still pictured (s.gone). */
export function findRoom(s: State, id: number): { plot: number; room: PlacedRoom } {
  for (let plot = 0; plot < s.keep.plots.length; plot++) {
    const room = s.keep.plots[plot]!.rooms.find((r) => r.id === id)
    if (room) return { plot, room }
  }
  const gone = s.gone.find((g) => g.room.id === id)
  if (!gone) throw new Error(`no room ${id} in the keep or gone`)
  return gone
}

/** The particles' colours, all from the look's tokens. */
const FX = {
  dust: RAW_LOOK.sand.light,
  rock: [RAW_LOOK.rock.body, RAW_LOOK.rock.dark, RAW_LOOK.rock.light],
  wood: [MATERIAL_LOOK.planks.top, MATERIAL_LOOK.planks.face],
  soil: [BOX.soil.face, BOX.soil.top],
  concrete: [MATERIAL_LOOK.concrete.face, MATERIAL_LOOK.concrete.side],
  smoke: RAW_LOOK.rock.light,
  steam: C.white,
  drop: C.glassTint,
  note: INK,
} as const

/** How many particles can be alive at once; past that the oldest makes way. */
const POOL = 160
/** A dust puff: radius from PUFF_R0 to PUFF_R1 and back to nothing over PUFF_FOR, rising PUFF_RISE m/s, PUFF_ALPHA see-through. */
const PUFF_R0 = 0.1
const PUFF_R1 = 0.3
const PUFF_FOR = 0.55
const PUFF_RISE = 0.5
const PUFF_ALPHA = 0.85
/** Steam: a slower, bigger, lighter puff. */
const STEAM_FOR = 1.3
const STEAM_ALPHA = 0.7
/** A sparkle, SPARKLE_MIN to SPARKLE_MAX from tip to tip, scaling in and out over SPARKLE_FOR. */
const SPARKLE_MIN = 0.14
const SPARKLE_MAX = 0.28
const SPARKLE_FOR = 0.5
/** A chip of stone or wood: CHIP across, thrown up and out, falling under CHIP_G for CHIP_FOR. */
const CHIP = 0.09
const CHIP_G = 22
const CHIP_FOR = 0.6
/** Confetti: a piece CONFETTI_W by CONFETTI_H, falling under CONFETTI_G with CONFETTI_DRAG for CONFETTI_FOR. */
const CONFETTI_W = 0.07
const CONFETTI_H = 0.14
const CONFETTI_G = 9
const CONFETTI_DRAG = 1.6
const CONFETTI_FOR = 1.8
/** A music note: NOTE tall, rising NOTE_RISE over NOTE_FOR, swaying NOTE_SWAY. */
const NOTE = 0.26
const NOTE_RISE = 1.1
const NOTE_FOR = 1.2
const NOTE_SWAY = 0.12
/** A droplet or a speck of sawdust: its radius, gravity and life. */
const DROP_R = 0.05
const DROP_G = 16
const DROP_FOR = 0.6

type Kind = 'puff' | 'steam' | 'sparkle' | 'chip' | 'confetti' | 'note' | 'drop'

interface Particle {
  kind: Kind
  world: World
  /** Seconds since it was set off (below 0 while it waits its turn), and how long it lasts. */
  age: number
  life: number
  x: number
  y: number
  vx: number
  vy: number
  g: number
  drag: number
  size: number
  angle: number
  spin: number
  colour: string
}

const rand = (a: number, b: number) => a + (b - a) * Math.random()
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)]!

/** What each tool knocks off a boulder: the chosen tool sets the rock's burst. */
const WHACK: Record<Tool, 'chips' | 'puffs' | 'soil' | 'sparkles'> = {
  hammer: 'chips',
  pickaxe: 'chips',
  drill: 'puffs',
  shovel: 'soil',
  wrench: 'chips',
  wand: 'sparkles',
}

/** What an item's sound shows when it plays: notes for music, drops for water, steam for the sauna, sparkles for magic, a pinch of confetti for a pop. */
const PLAY: Partial<Record<ItemSound, 'notes' | 'drops' | 'steam' | 'sparkles' | 'confetti'>> = {
  note: 'notes',
  drum: 'notes',
  twang: 'notes',
  chime: 'notes',
  ding: 'notes',
  scratch: 'notes',
  boom: 'notes',
  splash: 'drops',
  flush: 'drops',
  bubble: 'steam',
  hiss: 'steam',
  sparkle: 'sparkles',
  twinkle: 'sparkles',
  zap: 'sparkles',
  pop: 'confetti',
}

/** Every particle on the stage. */
export class Effects {
  private pool: Particle[] = Array.from({ length: POOL }, () => ({ kind: 'puff', world: 'street', age: 0, life: 0, x: 0, y: 0, vx: 0, vy: 0, g: 0, drag: 0, size: 0, angle: 0, spin: 0, colour: FX.dust }))
  private next = 0

  /** Forgets every particle. */
  clear(): void {
    for (const p of this.pool) p.age = p.life = 0
  }

  /** How many particles are alive (or waiting), for the tests and ?debug. */
  get alive(): number {
    let n = 0
    for (const p of this.pool) if (p.age < p.life) n++
    return n
  }

  /** The oldest slot, reset: a particle of `kind` in `world` at (x, y), lasting `life`, set off after `wait`. */
  private take(kind: Kind, world: World, x: number, y: number, life: number, wait: number): Particle {
    const p = this.pool[this.next]!
    this.next = (this.next + 1) % POOL
    p.kind = kind
    p.world = world
    p.age = -wait
    p.life = life
    p.x = x
    p.y = y
    p.vx = p.vy = p.g = p.drag = p.angle = p.spin = 0
    p.size = 0
    p.colour = FX.dust
    return p
  }

  /** `n` puffs of dust (or smoke, or concrete) round (x, y), drifting outwards, after `wait`. */
  private dust(world: World, x: number, y: number, n: number, colour: string, wait: number): void {
    for (let i = 0; i < n; i++) {
      const side = n === 1 ? 0 : (i / (n - 1)) * 2 - 1
      const p = this.take('puff', world, x + side * 0.3, y - rand(0, 0.1), PUFF_FOR * rand(0.8, 1.1), wait + rand(0, 0.06))
      p.vx = side * rand(0.6, 1.2)
      p.vy = -PUFF_RISE
      p.size = rand(0.8, 1.1)
      p.colour = colour
    }
  }

  /** A poof: a ring of puffs bursting out of (x, y), something leaving. */
  poof(world: World, x: number, y: number, r: number): void {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + rand(-0.2, 0.2)
      const p = this.take('puff', world, x + Math.cos(a) * r * 0.4, y + Math.sin(a) * r * 0.4, PUFF_FOR * 1.2, 0)
      p.vx = Math.cos(a) * r * 2.2
      p.vy = Math.sin(a) * r * 2.2
      p.drag = 3
      p.size = 1.2
      p.colour = FX.dust
    }
  }

  /** `n` sparkles scattered `spread` round (x, y), one after another from `wait`. */
  private sparkles(world: World, x: number, y: number, n: number, spread: number, wait: number): void {
    for (let i = 0; i < n; i++) {
      const p = this.take('sparkle', world, x + rand(-spread, spread), y + rand(-spread, spread), SPARKLE_FOR, wait + i * 0.06)
      p.vy = -0.4
      p.size = rand(SPARKLE_MIN, SPARKLE_MAX)
      p.colour = Math.random() < 0.5 ? C.sparkle : C.sparkleWarm
    }
  }

  /** `n` chips in `colours` thrown up and out of (x, y) at about `speed` m/s. */
  private chips(world: World, x: number, y: number, n: number, colours: readonly string[], speed: number): void {
    for (let i = 0; i < n; i++) {
      const p = this.take('chip', world, x + rand(-0.15, 0.15), y + rand(-0.15, 0.15), CHIP_FOR * rand(0.8, 1.1), 0)
      const a = -Math.PI / 2 + rand(-1.1, 1.1)
      const v = speed * rand(0.7, 1.2)
      p.vx = Math.cos(a) * v
      p.vy = Math.sin(a) * v
      p.g = CHIP_G
      p.spin = rand(-10, 10)
      p.angle = rand(0, TAU)
      p.size = CHIP * rand(0.7, 1.3)
      p.colour = pick(colours)
    }
  }

  /** `n` pieces of confetti thrown up out of (x, y) after `wait`. */
  private confetti(world: World, x: number, y: number, n: number, wait: number): void {
    for (let i = 0; i < n; i++) {
      const p = this.take('confetti', world, x + rand(-0.3, 0.3), y + rand(-0.2, 0.2), CONFETTI_FOR * rand(0.8, 1), wait)
      p.vx = rand(-3, 3)
      p.vy = rand(-7, -3.5)
      p.g = CONFETTI_G
      p.drag = CONFETTI_DRAG
      p.spin = rand(6, 12) * (Math.random() < 0.5 ? -1 : 1)
      p.angle = rand(0, TAU)
      p.colour = C.confetti[i % C.confetti.length]!
    }
  }

  /** `n` puffs of steam rising from (x, y). */
  private steam(world: World, x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const p = this.take('steam', world, x + rand(-0.15, 0.15), y, STEAM_FOR * rand(0.8, 1.1), i * 0.18)
      p.vx = rand(-0.15, 0.15)
      p.vy = -0.7
      p.size = rand(1, 1.4)
      p.colour = FX.steam
    }
  }

  /** `n` music notes rising from (x, y), one after another. */
  private notes(world: World, x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const p = this.take('note', world, x + rand(-0.2, 0.2), y, NOTE_FOR, i * 0.25)
      p.angle = rand(0, TAU)
      p.size = Math.random() < 0.5 ? 1 : -1
      p.colour = FX.note
    }
  }

  /** `n` droplets (or specks) in `colour` thrown up from (x, y). */
  private drops(world: World, x: number, y: number, n: number, colour: string): void {
    for (let i = 0; i < n; i++) {
      const p = this.take('drop', world, x + rand(-0.2, 0.2), y, DROP_FOR * rand(0.8, 1.1), 0)
      p.vx = rand(-1.6, 1.6)
      p.vy = rand(-4.5, -2.5)
      p.g = DROP_G
      p.size = DROP_R * rand(0.7, 1.2)
      p.colour = colour
    }
  }

  /**
   * Sets off what this frame's events call for, each in its own world: the road's events
   * where they say they happen on the road (they can come in the step a trip ends, when the
   * street is already shown and s.road is null: their particles then die out unseen), every
   * other event on the street. A room's events say which room and slot, so their particles go
   * exactly there.
   */
  spawn(s: State, events: readonly SimEvent[]): void {
    const machineTop = (m: MachineId) => {
      const r = machineRect(m)
      return { x: r.x + r.w / 2, y: r.y }
    }
    for (const e of events) {
      switch (e.kind) {
        case 'pickup':
          this.sparkles('road', e.x, e.y - 0.3, 3, 0.3, 0)
          break
        case 'whack': {
          const burst = WHACK[e.tool]
          if (burst === 'chips') this.chips('road', e.x, e.y, e.tool === 'pickaxe' ? 4 : 3, FX.rock, 4)
          else if (burst === 'soil') this.chips('road', e.x, e.y, 5, FX.soil, 3.5)
          else if (burst === 'sparkles') this.sparkles('road', e.x, e.y, 4, 0.35, 0)
          this.dust('road', e.x, e.y, burst === 'puffs' ? 3 : 1, FX.dust, 0)
          break
        }
        case 'crack':
          this.chips('road', e.x, e.y, 8, FX.rock, 5)
          this.dust('road', e.x, e.y + 0.4, 3, FX.dust, 0)
          if (e.gem) this.sparkles('road', e.x, e.y, 5, 0.4, 0)
          break
        case 'land':
        case 'ramp': {
          // Dust from under the back wheels as the truck leaves the lip, from under both as it lands.
          const half = TRUCK.wheelBase / 2
          const n = e.kind === 'land' && e.hard ? 3 : 2
          this.dust('road', e.x - half, e.y, n, FX.dust, 0)
          if (e.kind === 'land') this.dust('road', e.x + half, e.y, n, FX.dust, 0)
          break
        }
        case 'honk':
          this.notes('road', e.x + TRUCK.length / 2, e.y - 1.6, 2)
          break
        case 'answer':
          this.notes('road', e.x, e.y - 1.2, 1)
          break
        case 'present':
          // Into the bed on the road. At home the event comes as the box lands in the yard behind the tipped bed (layout.PRESENT_X) and opens, or at once on a tap where it stands.
          if (s.road !== null) {
            const bed = placePoint(s, { kind: 'bed' })
            this.sparkles('road', bed.x, bed.y - 0.4, 4, 0.4, 0)
          } else this.sparkles('street', PRESENT_X, -0.6, 4, 0.4, 0)
          break
        case 'unlock':
          this.sparkles('street', PRESENT_X, -0.9, 6, 0.6, 0)
          this.confetti('street', PRESENT_X, -1.0, 30, 0)
          break
        case 'tip':
          this.dust('street', TRUCK_TIP_X - TRUCK.length / 2 - 0.4, 0, 4, FX.dust, 0.3)
          break
        case 'crate': {
          const r = machineRect(e.m)
          this.dust('street', r.x + 0.3, 0, 2, FX.dust, CRATE_DROP)
          this.dust('street', r.x + r.w - 0.3, 0, 2, FX.dust, CRATE_DROP)
          break
        }
        case 'crateHit': {
          const c = machineTop(e.m)
          this.chips('street', c.x, c.y + 1.2, 4, FX.wood, 3.5)
          break
        }
        case 'machineBuilt': {
          const c = machineTop(e.m)
          this.confetti('street', c.x, c.y, 30, 0)
          this.sparkles('street', c.x, c.y + 0.8, 5, 0.8, 0)
          this.dust('street', c.x, 0, 4, FX.dust, 0)
          break
        }
        case 'batch': {
          const c = machineTop(e.m)
          const out = stackRect(e.m)
          if (e.m === 'sawmill') this.drops('street', out.x - 0.2, -0.9, 6, FX.wood[0])
          else if (e.m === 'mixer') this.dust('street', out.x - 0.2, -0.6, 2, FX.concrete[0], 0)
          else if (e.m === 'rainbow') this.sparkles('street', c.x, c.y, 3, 0.4, 0)
          else this.steam('street', c.x, c.y, 2)
          break
        }
        case 'push':
          this.sparkles('street', stackRect(e.m).x - 0.2, -0.8, 2, 0.2, 0)
          break
        case 'cough': {
          const c = machineTop(e.m)
          this.dust('street', c.x, c.y, 1, FX.smoke, 0)
          break
        }
        case 'house': {
          const kind = s.keep.plots[e.plot]!.kind!
          const w = HOUSE_GRID[kind].cols * CELL
          this.sparkles('street', gridLeft(e.plot) + w / 2, -1.2, 6, w / 2, 0)
          this.dust('street', gridLeft(e.plot) + w / 2, 0, 3, FX.dust, 0)
          break
        }
        case 'landed': {
          const found = findRoom(s, e.room)
          const r = interiorRect(found.plot, found.room)
          this.dust('street', r.x, r.y + r.h, 2, FX.dust, 0)
          this.dust('street', r.x + r.w, r.y + r.h, 2, FX.dust, 0)
          this.confetti('street', r.x + r.w / 2, r.y + 0.3, 24, 0)
          break
        }
        case 'theme': {
          const r = interiorRect(e.plot, findRoom(s, e.room).room)
          this.confetti('street', r.x + r.w / 2, r.y + 0.4, 30, 0)
          break
        }
        case 'paint': {
          if (s.shot.kind !== 'room') break
          const found = findRoom(s, s.shot.room)
          const r = interiorRect(found.plot, found.room)
          this.sparkles('street', r.x + r.w / 2, r.y + r.h / 2, 6, r.w / 3, 0)
          break
        }
        case 'itemIn':
        case 'itemOut': {
          const c = centre(slotRect(e.plot, findRoom(s, e.room).room, e.slot))
          if (e.kind === 'itemIn') this.sparkles('street', c.x, c.y, 4, 0.3, 0)
          else this.poof('street', c.x, c.y, 0.4)
          break
        }
        case 'play': {
          const burst = PLAY[ITEMS[e.item].sound]
          if (!burst) break
          const r = slotRect(e.plot, findRoom(s, e.room).room, e.slot)
          const x = r.x + r.w / 2
          if (burst === 'notes') this.notes('street', x, r.y, 2)
          else if (burst === 'drops') this.drops('street', x, r.y + r.h * 0.4, 5, FX.drop)
          else if (burst === 'steam') this.steam('street', x, r.y + r.h * 0.3, 3)
          else if (burst === 'sparkles') this.sparkles('street', x, r.y + r.h / 2, 3, 0.3, 0)
          else this.confetti('street', x, r.y, 10, 0)
          break
        }
        case 'roof': {
          const p = s.keep.plots[e.plot]!
          for (let col = 0; col < HOUSE_GRID[p.kind!].cols; col++) {
            const r = roofRect(e.plot, p, col)
            if (r) this.sparkles('street', r.x + r.w / 2, r.y + r.h / 2, 1, 0.3, 0)
          }
          break
        }
        case 'doorbell': {
          const p = s.keep.plots[e.plot]!
          const w = HOUSE_GRID[p.kind!].cols * CELL
          this.notes('street', gridLeft(e.plot) + w / 2, -1.8, 3)
          break
        }
        case 'newPlot':
          for (let i = 0; i < 6; i++) this.dust('street', plotLeft(e.plot) + ((i + 0.5) / 6) * PLOT_W, 0, 2, FX.soil[1], (i / 6) * BULLDOZE)
          break
        case 'wear':
        case 'dice':
          this.sparkles('street', MIRROR_BUILDER_X, -0.7, e.kind === 'dice' ? 7 : 4, 0.45, 0)
          break
        default:
          break
      }
    }
  }

  /** Moves every particle on by dt seconds and draws those of `world` in world metres (the context is already in world units). Leaves the context as it found it. */
  draw(ctx: CanvasRenderingContext2D, world: World, dt: number): void {
    for (const p of this.pool) {
      if (p.age >= p.life) continue
      p.age += dt
      if (p.age < 0 || p.age >= p.life) continue
      p.vy += p.g * dt
      if (p.drag > 0) {
        const k = Math.exp(-p.drag * dt)
        p.vx *= k
        p.vy *= k
      }
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.angle += p.spin * dt
    }
    for (const p of this.pool) {
      if (p.world !== world || p.age < 0 || p.age >= p.life) continue
      const u = p.age / p.life
      // Everything shrinks away over its last fifth instead of fading.
      const end = clamp01((1 - u) / 0.2)
      switch (p.kind) {
        case 'puff':
        case 'steam': {
          const r = (p.kind === 'puff' ? PUFF_R0 + (PUFF_R1 - PUFF_R0) * Math.sqrt(u) : 0.12 + 0.3 * u) * p.size * Math.min(1, (1 - u) / 0.35)
          ctx.globalAlpha = p.kind === 'puff' ? PUFF_ALPHA : STEAM_ALPHA
          ctx.beginPath()
          ctx.arc(p.x, p.y, Math.max(0, r), 0, TAU)
          ctx.fillStyle = p.colour
          ctx.fill()
          ctx.globalAlpha = 1
          break
        }
        case 'sparkle':
          sparklePath(ctx, p.x, p.y, p.size * Math.sin(Math.PI * u))
          ctx.fillStyle = p.colour
          ctx.fill()
          break
        case 'chip': {
          const h = (p.size / 2) * end
          const c = Math.cos(p.angle)
          const sn = Math.sin(p.angle)
          ctx.beginPath()
          ctx.moveTo(p.x + c * h, p.y + sn * h)
          ctx.lineTo(p.x - sn * h * 0.8, p.y + c * h * 0.8)
          ctx.lineTo(p.x - c * h, p.y - sn * h)
          ctx.lineTo(p.x + sn * h * 0.6, p.y - c * h * 0.6)
          ctx.closePath()
          ctx.fillStyle = p.colour
          ctx.fill()
          break
        }
        case 'confetti': {
          // The piece flips over as it spins (its width runs through cos) and tilts slowly in its own plane.
          const hw = (CONFETTI_W / 2) * Math.cos(p.angle) * end
          const hh = (CONFETTI_H / 2) * end
          const tilt = p.angle * 0.3
          const c = Math.cos(tilt)
          const sn = Math.sin(tilt)
          ctx.beginPath()
          ctx.moveTo(p.x - hw * c + hh * sn, p.y - hw * sn - hh * c)
          ctx.lineTo(p.x + hw * c + hh * sn, p.y + hw * sn - hh * c)
          ctx.lineTo(p.x + hw * c - hh * sn, p.y + hw * sn + hh * c)
          ctx.lineTo(p.x - hw * c - hh * sn, p.y - hw * sn + hh * c)
          ctx.closePath()
          ctx.fillStyle = p.colour
          ctx.fill()
          break
        }
        case 'note': {
          // A quaver: a tilted head, a stem and a flag, rising and swaying, grown in and shrunk away.
          const k = NOTE * Math.min(1, u / 0.15) * end
          const x = p.x + NOTE_SWAY * Math.sin(TAU * 1.2 * p.age + p.angle)
          const y = p.y - NOTE_RISE * (1 - (1 - u) * (1 - u))
          const dir = p.size
          ctx.beginPath()
          ctx.ellipse(x, y, k * 0.24, k * 0.17, -0.4, 0, TAU)
          ctx.fillStyle = p.colour
          ctx.fill()
          ctx.beginPath()
          ctx.moveTo(x + dir * k * 0.2, y - k * 0.02)
          ctx.lineTo(x + dir * k * 0.2, y - k * 0.9)
          ctx.quadraticCurveTo(x + dir * k * 0.5, y - k * 0.75, x + dir * k * 0.45, y - k * 0.45)
          ctx.lineWidth = lw('line')
          ctx.lineCap = 'round'
          ctx.strokeStyle = p.colour
          ctx.stroke()
          ctx.lineCap = 'butt'
          break
        }
        case 'drop':
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size * end, 0, TAU)
          ctx.fillStyle = p.colour
          ctx.fill()
          break
      }
    }
  }
}
