import { BURROWS, LANDS, cellOf, xOf, yOf } from '../game/board'
import { SIZE, TOWER_FLIGHT } from '../game/catalog'
import { DX, DY, HOP, HZ, KINDS, OVER, STEP, isMaker, newBuilding, slotCell, thingIndex, type Building, type Kind as BuildingKind, type Muncher, type Placeable, type SimEvent, type State, type Thing } from '../game/model'
import { listening, nearFlowers } from '../game/munchers'
import { blankState } from '../game/rules'
import { muncherDrawn, pictureDoor } from '../game/layout'
import { buildingBox, burrowBox, heapPoint, padBox, type Box, type Point } from '../game/where'
import { BEEP, BELT, BUILDING, C, GLASS, HEDGE, LAND, NIGHT, THING, TAU, addCircle, arch, clamp01, heartPath, loop, mix, pen, smooth, sparklePath, starPath, type SheetEntry } from './look'
import { MOUTH } from './critters'
import { drawThing } from './things'

/**
 * The particles: confetti in thing colours, puffs (a pop-in, a slap, a nibble's crunch), the
 * song's music notes drifting from a working machine to the burrow it wakes, sparkles and
 * little stars, a tower's puff of suds flying and landing, a nom's crumbs, a tree's leaf, a
 * flower's petal, hearts, a gulp into a machine's mouth, and the hint's soft white ring
 * (drawHintRing). They live only in the picture (the stamp rule: events feed only sounds and
 * particles), so Math.random is fine here.
 *
 * Calm (look.ts rule 10): a burst is a handful, nothing flashes, and every particle grows and
 * shrinks away rather than fading, so no see-through rings stack up. While munchers are out
 * the factory's own particles (the notes, the gulps, the rocket's fills) halve, and the
 * visiting burrow gets no notes, so she can follow the visit.
 *
 * Positions are board cells. Each particle has a board point and its own drift in the
 * upright frame (screen up), so on the upright board (a quarter turn, layout.ts) confetti
 * still falls down the screen and every shape stays upright: `draw` reads the board's turn
 * off the context's transform. A traveller (a note, a shot, a gulp) eases from one board
 * point to another. One fixed pool, reused from the oldest, so nothing is made per frame.
 */

/** At most this many particles are alive at once; past that the oldest makes way. */
export const POOL = 200
/** A bar of the band: eight hops (four beats at 90 bpm). A machine sends its burrow at most one note a bar, on its own eighth. */
const BAR = 8 * HOP
/** Each kind's eighth in the bar, so the notes come on the band's grid without piling up: the pad's big drum on the downbeat. */
const BEAT: Partial<Record<BuildingKind, number>> = { pad: 0, digger: 0, oven: 2, workshop: 4, greenMaker: 6, orangeMaker: 1, pump: 3 }
/** A note takes this long from its machine to its burrow (under a bar, so a machine's notes never overlap), big from a machine on the flowers, small from one near them, in the flowers' violet. */
const NOTE_FOR = 1.6
const NOTE_BIG = 0.3
const NOTE_SMALL = 0.2
/** Where things are above a picture's origin in the upright frame: a building's roof (from its middle), a tower's wand, a burrow's mound, the rocket on its pad, Beep's head. */
const ROOF = -0.55
const WAND = -0.55
const MOUND = -0.25
const ROCKET_TOP = -1.1
const BEEP_HEAD = -0.95
/** The hint's bounce: the one next step rises HINT_RISE on an HINT_PERIOD period (plans/rocket-factory.md, The one next step). */
const HINT_RISE = 0.2
const HINT_PERIOD = 0.8

type Kind = 'puff' | 'confetti' | 'note' | 'sparkle' | 'star' | 'shot' | 'foam' | 'bit' | 'leaf' | 'petal' | 'heart' | 'gulp'

interface Particle {
  kind: Kind
  /** Seconds since it was set off (below 0 while it waits its turn), and how long it lasts. */
  age: number
  life: number
  /** Its board point and, for a traveller, the board point it goes to (else the same). */
  x: number
  y: number
  x1: number
  y1: number
  /** Its drift from there in the upright frame, its velocity and gravity there (positive is down the screen), and its drag. */
  ox: number
  oy: number
  vx: number
  vy: number
  g: number
  drag: number
  size: number
  angle: number
  spin: number
  colour: string
  thing: Thing
}

const rand = (a: number, b: number) => a + (b - a) * Math.random()
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)]!
const middle = (b: Box): Point => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 })
const cellMiddle = (c: number): Point => ({ x: xOf(c) + 0.5, y: yOf(c) + 0.5 })

/** A building for the song's memory: its id, kind and place, so a new game, whose ids start again, never inherits an old building's notes. */
const songKey = (b: Building) => b.id * 4096 + KINDS.indexOf(b.kind) * 256 + cellOf(b.x, b.y)

/** A sticker she holds up, on the spot it snaps to (its footprint's top-left cell), where it fits: the notes it would send once it works there show before she places it. */
export interface HeldGhost {
  sticker: Placeable
  x: number
  y: number
}

/** The burrow a footprint's notes go to: one whose flowers it stands on, else one it is near (munchers.ts nearFlowers, the hunger's own rule), the first by burrow on a tie; or null. */
function reachOf(kind: BuildingKind, x0: number, y0: number): { burrow: number; on: boolean } | null {
  let found: { burrow: number; on: boolean } | null = null
  for (let i = 0; i < BURROWS.length && found?.on !== true; i++)
    for (let y = y0; y < y0 + SIZE[kind]; y++)
      for (let x = x0; x < x0 + SIZE[kind]; x++) {
        const z = nearFlowers(i, cellOf(x, y))
        if (z === 'on') found = { burrow: i, on: true }
        else if (z === 'near' && found === null) found = { burrow: i, on: false }
      }
  return found
}

/** The hinted thing's height (cells) at time t: the renderer bounces it and drawHintRing breathes on this one clock. */
export const hintLift = (t: number) => HINT_RISE * arch(loop(t, HINT_PERIOD, 0))

/**
 * The hint's soft white ring of radius r on the ground at the origin, under the one thing that
 * bounces: a soft wide band and a bright core over a teal shadow, a little smaller while the
 * thing is up. It never blinks.
 */
export function drawHintRing(ctx: CanvasRenderingContext2D, r: number, t: number): void {
  const k = r * (1 - 0.06 * arch(loop(t, HINT_PERIOD, 0)))
  const alpha = ctx.globalAlpha
  // Bold enough to read on the pale ground and the yellow flask alike: the loudest still thing on the board.
  for (const [x, y, colour, w, a] of [
    [pen.shadowX, pen.shadowY, C.hintShadow, 0.09, 1],
    [0, 0, C.hint, 0.17, 0.5],
    [0, 0, C.hint, 0.075, 1],
  ] as const) {
    ctx.beginPath()
    ctx.arc(x, y, k, 0, TAU)
    ctx.lineWidth = Math.max(w, 1 / (pen.dpr * pen.ppm))
    ctx.strokeStyle = colour
    ctx.globalAlpha = alpha * a
    ctx.stroke()
  }
  ctx.globalAlpha = alpha
}

/** Every particle on the board, and what the song has sent this bar. */
export class Effects {
  private pool: Particle[] = Array.from({ length: POOL }, () => ({ kind: 'puff', age: 0, life: 0, x: 0, y: 0, x1: 0, y1: 0, ox: 0, oy: 0, vx: 0, vy: 0, g: 0, drag: 0, size: 0, angle: 0, spin: 0, colour: C.white, thing: 'bubble' }))
  private next = 0
  /** The board's turn on screen when it was last drawn (radians), for placing what spawns above a picture. */
  private turn = 0
  /** Every other one of the factory's own particles is left out while munchers are out. */
  private skip = false
  /** Per building (by `songKey`), the last bar it sent a note in, and which burrow its notes go to (on its flowers, or near them) or null; the last bar a held sticker's ghost sent one in. */
  private sent = new Map<number, number>()
  private reach = new Map<number, { burrow: number; on: boolean } | null>()
  private ghostSent = -1

  /** Forgets every particle and every note sent: the renderer starting over (a lost context, the board gone). */
  clear(): void {
    for (const p of this.pool) p.age = p.life = 0
    this.sent.clear()
    this.reach.clear()
    this.ghostSent = -1
  }

  /** How many particles are alive or waiting their turn, for the tests and ?debug. */
  get alive(): number {
    let n = 0
    for (const p of this.pool) if (p.age < p.life) n++
    return n
  }

  /** The board's turn when it was last drawn in quarter turns (layout.ts View.turn): where the pictures put a muncher and a burrow's door. */
  private get quarter(): number {
    return -this.turn / (Math.PI / 2)
  }

  /** The upright offset (ox, oy) from board point (x, y) as a board point, on the board as it was last turned. */
  private above(x: number, y: number, ox: number, oy: number): Point {
    const c = Math.cos(-this.turn)
    const s = Math.sin(-this.turn)
    return { x: x + c * ox - s * oy, y: y + s * ox + c * oy }
  }

  /** The oldest slot, reset: a particle of `kind` at board point (x, y) drifting from (ox, oy), lasting `life`, set off after `wait`. */
  private take(kind: Kind, x: number, y: number, ox: number, oy: number, life: number, wait: number): Particle {
    const p = this.pool[this.next]!
    this.next = (this.next + 1) % POOL
    p.kind = kind
    p.age = -wait
    p.life = life
    p.x = p.x1 = x
    p.y = p.y1 = y
    p.ox = ox
    p.oy = oy
    p.vx = p.vy = p.g = p.drag = p.angle = p.spin = 0
    p.size = 1
    p.colour = C.white
    return p
  }

  /** `n` puffs round (x, y) + (ox, oy) `spread` apart, drifting out and up: a pop-in, a slap, dust. */
  private puffs(x: number, y: number, ox: number, oy: number, n: number, spread: number, size: number, colour: string, wait: number) {
    for (let i = 0; i < n; i++) {
      const side = n === 1 ? 0 : (i / (n - 1)) * 2 - 1
      const p = this.take('puff', x, y, ox + side * spread, oy + rand(-0.04, 0.04), 0.5 * rand(0.85, 1.15), wait + rand(0, 0.05))
      p.vx = side * rand(0.4, 0.8)
      p.vy = -rand(0.25, 0.45)
      p.drag = 2.5
      p.angle = rand(-0.6, 0.6)
      p.size = size * rand(0.85, 1.1)
      p.colour = colour
    }
  }

  /** `n` sparkles (or little stars: Moony, the night) scattered `spread` round (x, y) + (ox, oy), one after another, each growing and shrinking away. */
  private sparkles(x: number, y: number, ox: number, oy: number, n: number, spread: number, colour: string, wait: number, kind: 'sparkle' | 'star') {
    for (let i = 0; i < n; i++) {
      const p = this.take(kind, x, y, ox + rand(-spread, spread), oy + rand(-spread, spread), kind === 'star' ? 0.8 : 0.5, wait + i * 0.07)
      p.vy = -0.3
      p.spin = rand(-1.5, 1.5)
      p.size = kind === 'star' ? rand(0.09, 0.13) : rand(0.13, 0.22)
      p.colour = colour
    }
  }

  /** `n` bits (crumbs, chips, drops, leaf crumbs) in `colours` thrown up and out of (x, y) + (ox, oy) at about `speed`, falling back. */
  private bits(x: number, y: number, ox: number, oy: number, n: number, colours: readonly string[], speed: number, size: number) {
    for (let i = 0; i < n; i++) {
      const p = this.take('bit', x, y, ox + rand(-0.06, 0.06), oy + rand(-0.04, 0.04), 0.55 * rand(0.85, 1.15), 0)
      const a = -Math.PI / 2 + rand(-1.1, 1.1)
      const v = speed * rand(0.7, 1.2)
      p.vx = Math.cos(a) * v
      p.vy = Math.sin(a) * v
      p.g = 9
      p.spin = rand(-9, 9)
      p.angle = rand(0, TAU)
      p.size = size * rand(0.75, 1.25)
      p.colour = pick(colours)
    }
  }

  /**
   * `n` pieces of confetti in thing colours over a span `w` wide round (x, y) + (ox, oy):
   * tossed up and fluttering down from a burst, or for a card's rain let go along the top and
   * falling the whole land's height.
   */
  private confetti(x: number, y: number, ox: number, oy: number, n: number, w: number, wait: number, rain: boolean) {
    for (let i = 0; i < n; i++) {
      const p = this.take('confetti', x, y, ox + rand(-w / 2, w / 2), oy + rand(-0.2, 0.2), (rain ? 3.4 : 2.2) * rand(0.8, 1), wait + rand(0, rain ? 0.8 : 0.25))
      p.vx = rand(-1.2, 1.2)
      p.vy = rain ? rand(-1, 0.5) : rand(-4.5, -2)
      p.g = rain ? 5 : 4
      p.drag = rain ? 1.5 : 1.8
      p.spin = rand(5, 10) * (Math.random() < 0.5 ? -1 : 1)
      p.angle = rand(0, TAU)
      p.colour = C.confetti[i % C.confetti.length]!
    }
  }

  /** `n` hearts rising and swaying from (x, y) + (ox, oy), one after another. */
  private hearts(x: number, y: number, ox: number, oy: number, n: number) {
    for (let i = 0; i < n; i++) {
      const p = this.take('heart', x, y, ox + rand(-0.15, 0.15), oy, 1.2, i * 0.22)
      p.vy = -0.55
      p.angle = rand(0, TAU)
      p.size = rand(0.16, 0.22)
      p.colour = C.heart
    }
  }

  /** One leaf (or petal) from (x, y) + (ox, oy): popped up a little, then drifting down the screen and swaying. */
  private flutter(kind: 'leaf' | 'petal', x: number, y: number, ox: number, oy: number, colour: string) {
    const p = this.take(kind, x, y, ox, oy, 1.5, 0)
    p.vx = rand(-0.3, 0.3)
    p.vy = kind === 'petal' ? -1.3 : -0.2
    p.g = kind === 'petal' ? 2.6 : 0.9
    p.drag = 1.2
    p.angle = rand(0, TAU)
    p.spin = rand(-2, 2)
    p.size = kind === 'petal' ? 0.07 : 0.1
    p.colour = colour
  }

  /** A traveller from board point a to board point b over `life`: a note, a shot, a gulp. */
  private travel(kind: 'note' | 'shot' | 'gulp', a: Point, b: Point, life: number, size: number, colour: string): Particle {
    const p = this.take(kind, a.x, a.y, 0, 0, life, 0)
    p.x1 = b.x
    p.y1 = b.y
    p.size = size
    p.colour = colour
    p.angle = rand(0, TAU)
    return p
  }

  /**
   * The muncher or the building an event names, or null when it has gone since: a frame's
   * events come from all its steps (several under ?fast, or catching up after a stall) and the
   * state is the last one's, so a muncher shot at from its doorway may be home and gone by
   * then, a sticker placed and peeled again between two frames. Its particles are then left out.
   */
  private muncher(s: State, id: number): Muncher | null {
    return s.munchers.find((x) => x.id === id) ?? null
  }
  private building(s: State, id: number): Building | null {
    return s.buildings.find((x) => x.id === id) ?? null
  }

  /**
   * Sets off what this step's events call for, each where it says it happens, then the song's
   * notes for this moment of the bar (`notes`), the held sticker's ghost's among them. `t` is
   * the sim time in seconds, the same the pictures are drawn at, so a shot can aim where its
   * muncher will be when the suds land.
   */
  spawn(events: readonly SimEvent[], s: State, t: number, ghost: HeldGhost | null): void {
    const out = s.munchers.length > 0
    /** The factory's own particles halve while munchers are out. */
    const ambient = () => {
      this.skip = !this.skip
      return !(out && this.skip)
    }
    for (const e of events) {
      switch (e.kind) {
        case 'dig': {
          const p = cellMiddle(e.cell)
          if (e.thing === 'bubble') this.bits(p.x, p.y, 0, -0.05, 5, [LAND.pondLight, LAND.pond], 2.4, 0.07)
          else {
            this.bits(p.x, p.y, 0, -0.05, 4, [THING[e.thing].key, THING[e.thing].light], 2.2, 0.08)
            this.puffs(p.x, p.y, 0, 0.05, 2, 0.2, 0.12, C.white, 0)
          }
          break
        }
        case 'full': {
          const p = cellMiddle(e.cell)
          this.puffs(p.x, p.y, 0, 0.05, 1, 0, 0.12, C.grey, 0)
          break
        }
        case 'lay':
        case 'rollUp': {
          // A pop at the end of the stroke; the cells pop in or curl away themselves.
          const p = cellMiddle(e.cells[e.cells.length - 1]!)
          this.puffs(p.x, p.y, 0, 0, 2, 0.18, 0.1, C.white, 0)
          break
        }
        case 'bridge':
        case 'join':
        case 'fork': {
          const p = cellMiddle(e.cell)
          this.sparkles(p.x, p.y, 0, -0.1, 3, 0.25, C.sparkle, 0, 'sparkle')
          break
        }
        case 'hedgeIn':
          for (const c of e.cells) {
            const p = cellMiddle(c)
            this.bits(p.x, p.y, 0, -0.1, 2, [HEDGE.light, HEDGE.body], 1.4, 0.07)
          }
          break
        case 'place': {
          // The slap: puffs squeezed out from under the sticker's bottom corners.
          const b = this.building(s, e.id)
          if (b === null) break
          const box = buildingBox(b)
          const p = middle(box)
          const half = box.w / 2
          this.puffs(p.x, p.y, -half, half - 0.1, 2, 0.12, 0.14, C.white, 0.05)
          this.puffs(p.x, p.y, half, half - 0.1, 2, 0.12, 0.14, C.white, 0.05)
          break
        }
        case 'lift':
        case 'carry':
          this.sparkles(e.x, e.y, 0, -0.15, 2, 0.15, C.sparkle, 0, 'sparkle')
          break
        case 'nope':
          this.puffs(e.x, e.y, 0, 0, 1, 0, 0.14, C.grey, 0)
          break
        case 'gulp': {
          // The thing goes into the machine's mouth it came by: the one whose belt carries that thing (a bridge's over lane leaves by its own side). A thing Beep brought by hand comes by no mouth.
          const mouths = s.net.mouths.get(e.id) ?? []
          if (mouths.length === 0 || !ambient()) break
          const thing = thingIndex(e.thing)
          const slot = mouths.find((m) => s.belts.slot[m] === thing || s.belts.slot[m - 1] === thing) ?? mouths[0]!
          const c = slotCell(slot)
          const d = slot >= OVER ? s.belts.over[c]! : s.belts.out[c]!
          const a = { x: xOf(c) + 0.5 + DX[d]! * 0.38, y: yOf(c) + 0.5 + DY[d]! * 0.38 }
          const p = this.travel('gulp', a, { x: a.x + DX[d]! * 0.2, y: a.y + DY[d]! * 0.2 }, 0.25, 0.3, C.white)
          p.thing = e.thing
          break
        }
        case 'fill': {
          if (!ambient()) break
          const p = middle(padBox)
          this.sparkles(p.x, p.y, 0, -0.5, 1, 0.4, C.sparkle, 0, 'sparkle')
          break
        }
        case 'partFull': {
          const p = middle(padBox)
          this.confetti(p.x, p.y, 0, ROCKET_TOP + 0.3, 24, 1.6, 0, false)
          this.sparkles(p.x, p.y, 0, -0.6, 6, 0.7, C.sparkle, 0, 'sparkle')
          break
        }
        case 'card': {
          // The celebration: confetti falls over the whole land from above the top of the screen.
          const w = LANDS[s.land]
          const across = w.x1 - w.x0 + 1
          const down = w.y1 - w.y0 + 1
          const turned = Math.abs(Math.sin(this.turn)) > 0.5
          const p = { x: (w.x0 + w.x1 + 1) / 2, y: (w.y0 + w.y1 + 1) / 2 }
          this.confetti(p.x, p.y, 0, -(turned ? across : down) / 2 - 0.2, 44, turned ? down : across, 0, true)
          break
        }
        case 'hopOut': {
          // Out of the door the burrow's picture shows (upright, not the board's south edge).
          const d = pictureDoor(e.burrow, this.quarter)
          this.puffs(d.x, d.y, 0, -0.05, 3, 0.22, 0.13, C.white, 0)
          break
        }
        case 'nom':
          this.bits(e.x, e.y, MOUTH.x, MOUTH.y, 3, [THING[e.thing].key, THING[e.thing].light], 1.5, 0.06)
          break
        case 'napStart': {
          const b = this.building(s, e.building)
          if (b === null) break
          const p = middle(buildingBox(b))
          this.puffs(p.x, p.y, 0, ROOF, 2, 0.25, 0.12, C.white, 0)
          break
        }
        case 'burp':
          this.puffs(e.x, e.y, MOUTH.x + 0.04, MOUTH.y - 0.02, 2, 0.06, 0.08, C.white, 0)
          break
        case 'heap': {
          const p = heapPoint(e.burrow)
          this.puffs(p.x, p.y, 0, 0, 1, 0, 0.1, C.white, 0)
          break
        }
        case 'caught':
        case 'tickleBusy': {
          const m = this.muncher(s, e.id)
          if (m === null) break
          const p = muncherDrawn(m, t, this.quarter)
          this.sparkles(p.x, p.y, 0, -0.55, 3, 0.3, C.sparkle, 0, 'sparkle')
          break
        }
        case 'giggle':
          this.sparkles(e.x, e.y, 0, -0.6, 2, 0.25, C.sparkle, 0, 'sparkle')
          break
        case 'sneeze':
          // A-choo: a little spray of puffs from its nose.
          for (const side of [-1, 1]) this.puffs(e.x, e.y, MOUTH.x + side * 0.12, MOUTH.y - 0.04, 2, 0.05, 0.09, C.white, 0)
          break
        case 'shot': {
          // The tower's puff of suds, aimed at the muncher's nose where it will be when it lands; a napper's on its machine, where munchers.ts lands the suds (the footprint's middle).
          const from = this.building(s, e.tower)
          const target = this.muncher(s, e.muncher)
          if (from === null || target === null) break
          const tower = middle(buildingBox(from))
          const bed = s.buildings.find((b) => b.napper === target.id)
          const m = bed === undefined ? muncherDrawn(target, t + TOWER_FLIGHT * STEP, this.quarter) : { ...middle(buildingBox(bed)), lift: 0 }
          this.travel('shot', this.above(tower.x, tower.y, 0, WAND), this.above(m.x, m.y, MOUTH.x, MOUTH.y - 0.06 - m.lift), TOWER_FLIGHT * STEP, 0.12, C.white)
          break
        }
        case 'suds':
          // The puff lands: foam bursts on its nose.
          for (let i = 0; i < 6; i++) {
            const p = this.take('foam', e.x, e.y, MOUTH.x + rand(-0.08, 0.08), MOUTH.y - 0.06 + rand(-0.06, 0.04), 0.45 * rand(0.8, 1.2), 0)
            const a = rand(0, TAU)
            p.vx = Math.cos(a) * rand(0.4, 0.9)
            p.vy = Math.sin(a) * rand(0.4, 0.9) - 0.3
            p.drag = 3
            p.size = rand(0.035, 0.06)
          }
          break
        case 'picnic': {
          const m = this.muncher(s, e.id)
          if (m === null) break
          const p = muncherDrawn(m, t, this.quarter)
          this.hearts(p.x, p.y, 0, -0.75, 3)
          break
        }
        case 'friend': {
          const p = middle(burrowBox(e.burrow))
          this.hearts(p.x, p.y, 0, MOUND - 0.5, 5)
          this.sparkles(p.x, p.y, 0, MOUND, 4, 0.6, C.sparkle, 0.2, 'sparkle')
          break
        }
        case 'crunch': {
          // A bite out of a hedge: leaf crumbs and a puff.
          const p = cellMiddle(e.cell)
          this.bits(p.x, p.y, 0, -0.15, 4, [HEDGE.body, HEDGE.light, HEDGE.fold], 1.8, 0.07)
          this.puffs(p.x, p.y, 0, -0.1, 1, 0, 0.12, C.white, 0)
          break
        }
        case 'regrow': {
          const p = cellMiddle(e.cell)
          this.sparkles(p.x, p.y, 0, -0.1, 3, 0.25, HEDGE.light, 0, 'sparkle')
          break
        }
        case 'liftoff': {
          // The rocket lifts on rainbow puffs from under it.
          const p = middle(padBox)
          for (let i = 0; i < 12; i++) this.puffs(p.x, p.y, rand(-0.5, 0.5), 0.6, 1, 0, 0.22, C.confetti[i % C.confetti.length]!, i * 0.12)
          break
        }
        case 'landed': {
          const p = middle(padBox)
          this.confetti(p.x, p.y, 0, ROCKET_TOP, 30, 2.4, 0, false)
          this.sparkles(p.x, p.y, 0, -0.8, 6, 0.9, C.sparkle, 0.3, 'sparkle')
          break
        }
        case 'poke':
          switch (e.what) {
            case 'tree':
              this.flutter('leaf', e.x, e.y, rand(-0.15, 0.15), -0.25, pick([HEDGE.body, HEDGE.light]))
              break
            case 'flowers':
              this.flutter('petal', e.x, e.y, 0, -0.05, LAND.petal)
              break
            case 'ground':
              this.puffs(e.x, e.y, 0, 0, 2, 0.12, 0.12, C.white, 0)
              break
            case 'beep':
              // Its flip comes with a tune: three notes rising off its head.
              for (let i = 0; i < 3; i++) {
                const p = this.take('note', e.x, e.y, 0.15 + rand(-0.1, 0.1), BEEP_HEAD, 1.1, i * 0.22)
                p.vx = rand(0.1, 0.35)
                p.vy = -0.7
                p.size = NOTE_SMALL
                p.colour = BEEP.fold
              }
              break
            case 'moony':
              this.sparkles(e.x, e.y, 0, -0.35, 4, 0.25, GLASS.star, 0, 'star')
              break
            case 'belt':
            case 'burrow':
            case 'grey':
              break
          }
          break
        case 'tuck':
          // Good night: a few warm little stars over every machine of the kind she tucked in.
          for (const b of s.buildings) {
            if (b.kind !== e.machine) continue
            const p = middle(buildingBox(b))
            this.sparkles(p.x, p.y, 0, ROOF, 3, 0.45, NIGHT.light, 0, 'star')
          }
          break
        case 'play':
        case 'repoint':
        case 'peel':
        case 'oops':
        case 'pattern':
        case 'batch':
        case 'push':
        case 'drink':
        case 'cardClosed':
        case 'flap':
        case 'warn':
        case 'napEnd':
        case 'home':
        case 'shrug':
        case 'nibble':
        case 'visitOver':
        case 'launch':
        case 'count':
        case 'recipe':
        case 'goodnight':
        case 'sleep':
        case 'wake':
        case 'session':
        case 'say':
        case 'tool':
          break
        default:
          e satisfies never
      }
    }
    this.notes(s, ghost)
  }

  /** The burrow a building's notes go to (reachOf), worked out once, as a building never moves. */
  private reachOfBuilding(b: Building): { burrow: number; on: boolean } | null {
    const held = this.reach.get(songKey(b))
    if (held !== undefined) return held
    const found = reachOf(b.kind, b.x, b.y)
    this.reach.set(songKey(b), found)
    return found
  }

  /**
   * The song's notes: each working machine on or near a burrow's flowers sends that burrow a
   * note on its own eighth of the bar, at most one a bar, while the burrow is listening
   * (munchers.ts listening: its hunger grows from its flowers now), every other bar while
   * munchers are out. From Rocket! on, the drumming pad sends every listening burrow a big
   * note in turn. A machine's sticker she holds up sends the notes it would send once it works
   * there, paler, so a spot's cost to the munchers shows before she places it.
   */
  private notes(s: State, ghost: HeldGhost | null) {
    const bar = Math.floor(s.tick / BAR)
    const into = s.tick - bar * BAR
    if (s.munchers.length > 0 && bar % 2 === 1) return
    /** A note is due on `beat` of the bar from something whose last one was in bar `last`. */
    const due = (beat: number, last: number | undefined) => into >= (beat % 8) * HOP && last !== bar
    /** A note from the middle of the footprint `box` to `burrow`, big from on its flowers. */
    const note = (box: Box, burrow: number, big: boolean, colour: string) => {
      const from = middle(box)
      const to = middle(burrowBox(burrow))
      this.travel('note', this.above(from.x, from.y, rand(-0.2, 0.2), ROOF), this.above(to.x, to.y, rand(-0.2, 0.2), MOUND), NOTE_FOR, big ? NOTE_BIG : NOTE_SMALL, colour)
    }
    const send = (b: Building, burrow: number, big: boolean) => {
      if (!due(BEAT[b.kind]! + (b.kind === 'pad' ? 0 : 2 * (b.id % 4)), this.sent.get(songKey(b)))) return
      this.sent.set(songKey(b), bar)
      note(buildingBox(b), burrow, big, LAND.petal)
    }
    for (const b of s.buildings) {
      if (b.kind === 'pad') {
        if (!s.found.includes('rocket')) continue
        const open = BURROWS.map((_, i) => i).filter((i) => listening(s, i))
        if (open.length > 0) send(b, open[bar % open.length]!, true)
        continue
      }
      if (!isMaker(b.kind) || b.batch === null || b.napper !== -1 || b.tucked) continue
      const r = this.reachOfBuilding(b)
      if (r !== null && listening(s, r.burrow)) send(b, r.burrow, r.on)
    }
    if (ghost === null || !isMaker(ghost.sticker) || !due(BEAT[ghost.sticker]!, this.ghostSent)) return
    const r = reachOf(ghost.sticker, ghost.x, ghost.y)
    if (r === null || !listening(s, r.burrow)) return
    this.ghostSent = bar
    const n = SIZE[ghost.sticker]
    note({ x: ghost.x, y: ghost.y, w: n, h: n }, r.burrow, r.on, C.ghostNote)
  }

  /** Moves every particle on by dt seconds (a slow frame's dt held to 0.1 s, so nothing leaps). */
  update(dt: number): void {
    const h = Math.min(dt, 0.1)
    for (const p of this.pool) {
      if (p.age >= p.life) continue
      p.age += h
      if (p.age < 0 || p.age >= p.life) continue
      p.vy += p.g * h
      if (p.drag > 0) {
        const k = Math.exp(-p.drag * h)
        p.vx *= k
        p.vy *= k
      }
      p.ox += p.vx * h
      p.oy += p.vy * h
      p.angle += p.spin * h
    }
  }

  /** Moves every particle on by dt and draws them at sim time t, in board cells (the context is in board cells, turned as the board is), each upright on screen. Leaves the context as it found it. */
  draw(ctx: CanvasRenderingContext2D, t: number, dt: number): void {
    this.update(dt)
    const m = ctx.getTransform()
    this.turn = Math.atan2(m.b, m.a)
    const c = Math.cos(-this.turn)
    const sn = Math.sin(-this.turn)
    const cap = ctx.lineCap
    for (const p of this.pool) {
      if (p.age < 0 || p.age >= p.life) continue
      const u = p.age / p.life
      // Every particle shrinks away over its last fifth instead of fading.
      const end = clamp01((1 - u) / 0.2)
      const k = p.kind === 'note' ? smooth(0, 1, u) : u
      let ox = p.ox
      let oy = p.oy
      if (p.kind === 'note') {
        // Swaying as it goes; one going to a burrow drifts there on a gentle arc.
        ox += 0.08 * Math.sin(TAU * 1.4 * p.age + p.angle)
        if (p.x1 !== p.x || p.y1 !== p.y) oy -= 0.45 * arch(u)
      }
      if (p.kind === 'shot') oy -= 0.35 * arch(u)
      const x = mix(p.x, p.x1, k) + c * ox - sn * oy
      const y = mix(p.y, p.y1, k) + sn * ox + c * oy
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(-this.turn)
      switch (p.kind) {
        case 'puff': {
          // A little cloud of three balls, grown in and shrunk away.
          const r = p.size * (u < 0.3 ? 0.4 + 0.6 * smooth(0, 0.3, u) : 1 - smooth(0.3, 1, u))
          ctx.rotate(p.angle)
          ctx.beginPath()
          addCircle(ctx, 0, 0, r)
          addCircle(ctx, -0.6 * r, 0.25 * r, 0.7 * r)
          addCircle(ctx, 0.6 * r, 0.2 * r, 0.62 * r)
          ctx.fillStyle = p.colour
          ctx.fill()
          break
        }
        case 'confetti': {
          // A paper piece flipping over as it spins (its width runs through cos) and tilting slowly.
          const hw = 0.035 * Math.cos(p.angle) * end
          const hh = 0.065 * end
          ctx.rotate(p.angle * 0.3)
          ctx.fillStyle = p.colour
          ctx.fillRect(-Math.abs(hw), -hh, 2 * Math.abs(hw), 2 * hh)
          break
        }
        case 'note': {
          // A quaver: a tilted head, a stem and a flag, grown in and shrunk away into its burrow.
          const s = p.size * Math.min(1, u / 0.15) * clamp01((1 - u) / 0.25)
          if (s <= 0) break
          ctx.beginPath()
          ctx.ellipse(0, 0, s * 0.27, s * 0.19, -0.4, 0, TAU)
          ctx.fillStyle = p.colour
          ctx.fill()
          ctx.beginPath()
          ctx.moveTo(s * 0.22, -s * 0.02)
          ctx.lineTo(s * 0.22, -s * 0.9)
          ctx.quadraticCurveTo(s * 0.55, -s * 0.75, s * 0.5, -s * 0.42)
          ctx.lineCap = 'round'
          ctx.lineWidth = Math.max(s * 0.12, 1 / (pen.dpr * pen.ppm))
          ctx.strokeStyle = p.colour
          ctx.stroke()
          ctx.lineCap = cap
          break
        }
        case 'sparkle':
        case 'star':
          ctx.rotate(p.angle)
          if (p.kind === 'sparkle') sparklePath(ctx, 0, 0, p.size * Math.sin(Math.PI * u))
          else starPath(ctx, 0, 0, (p.size / 2) * Math.sin(Math.PI * u))
          ctx.fillStyle = p.colour
          ctx.fill()
          break
        case 'shot':
          // A puff of suds: three foam balls turning as they fly.
          ctx.rotate(p.angle + TAU * u)
          ctx.beginPath()
          for (const [fx, fy, fr] of [
            [0, 0, 0.5],
            [0.45, 0.2, 0.38],
            [-0.35, 0.3, 0.33],
          ] as const)
            addCircle(ctx, fx * p.size, fy * p.size, fr * p.size)
          ctx.fillStyle = C.white
          ctx.fill()
          break
        case 'foam':
          ctx.beginPath()
          ctx.arc(0, 0, p.size * (u < 0.2 ? 0.5 + 2.5 * u : 1 - smooth(0.2, 1, u)), 0, TAU)
          ctx.fillStyle = C.white
          ctx.fill()
          break
        case 'bit': {
          const h = (p.size / 2) * end
          const ca = Math.cos(p.angle)
          const sa = Math.sin(p.angle)
          ctx.beginPath()
          ctx.moveTo(ca * h, sa * h)
          ctx.lineTo(-sa * h * 0.8, ca * h * 0.8)
          ctx.lineTo(-ca * h, -sa * h)
          ctx.lineTo(sa * h * 0.7, -ca * h * 0.7)
          ctx.closePath()
          ctx.fillStyle = p.colour
          ctx.fill()
          break
        }
        case 'leaf':
        case 'petal': {
          // Falling with a swing from side to side, turning with it.
          ctx.translate(0.12 * Math.sin(TAU * 0.9 * p.age), 0)
          ctx.rotate(p.angle + 0.6 * Math.sin(TAU * 0.9 * p.age))
          const s = p.size * Math.min(1, u / 0.1) * end
          ctx.beginPath()
          if (p.kind === 'leaf') {
            ctx.moveTo(-s, 0)
            ctx.quadraticCurveTo(0, -s * 0.75, s, 0)
            ctx.quadraticCurveTo(0, s * 0.75, -s, 0)
            ctx.closePath()
          } else ctx.ellipse(0, 0, s, s * 0.55, 0, 0, TAU)
          ctx.fillStyle = p.colour
          ctx.fill()
          break
        }
        case 'heart': {
          const s = p.size * Math.min(1, u / 0.2) * clamp01((1 - u) / 0.25)
          heartPath(ctx, 0.06 * Math.sin(TAU * 1.1 * p.age + p.angle), 0, s)
          ctx.fillStyle = p.colour
          ctx.fill()
          break
        }
        case 'gulp': {
          // The thing going into the machine's mouth, shrinking as it goes until it is a speck (its rim alone would linger).
          const size = p.size * (1 - u)
          if (size * pen.ppm * pen.dpr >= 3) drawThing(ctx, p.thing, size, t, 0)
          break
        }
      }
      ctx.restore()
    }
  }
}

// ---------------------------------------------------------------------------------------
// The sheet

/**
 * A sheet cell that sets off `events` every `every` seconds on its own board (a fresh game,
 * changed by `setup`) and draws the particles over a sketch of what they come from (sheet only:
 * flat blocks in the land's and the buildings' colours). On a frozen sheet (&t=) it replays
 * the last burst up to that moment, so a still shows the particles in flight.
 */
function replaying(label: string, box: Box, every: number, setup: (s: State) => void, sketch: readonly (readonly [Box, string])[], events: (s: State) => SimEvent[]): SheetEntry {
  return replay(label, box, every, setup, sketch, events, null)
}
/** A sheet cell that holds a sticker up as its ghost the whole time on its own board, over a sketch, with the notes it would send there. */
function holding(label: string, box: Box, setup: (s: State) => void, sketch: readonly (readonly [Box, string])[], ghost: HeldGhost): SheetEntry {
  return replay(label, box, 10, setup, sketch, () => [], ghost)
}
/** `replaying`, with the sticker held up as a ghost, or none. */
function replay(label: string, box: Box, every: number, setup: (s: State) => void, sketch: readonly (readonly [Box, string])[], events: (s: State) => SimEvent[], ghost: HeldGhost | null): SheetEntry {
  let fx = new Effects()
  let s = blankState(1)
  let last: number | null = null
  const restart = () => {
    fx = new Effects()
    s = blankState(1)
    setup(s)
  }
  restart()
  return {
    label,
    box,
    draw: (ctx, t) => {
      if (last === null || t < last || t - last > 0.5) {
        restart()
        const from = t - (t % every)
        s.tick = Math.floor(from * HZ)
        fx.spawn(events(s), s, from, ghost)
        for (let at = from; at < t; at += STEP) {
          s.tick = Math.floor(at * HZ)
          fx.spawn([], s, at, ghost)
          fx.update(STEP)
        }
      } else {
        s.tick = Math.floor(t * HZ)
        fx.spawn(Math.floor(t / every) > Math.floor(last / every) ? events(s) : [], s, t, ghost)
        fx.update(t - last)
      }
      last = t
      s.tick = Math.floor(t * HZ)
      for (const [b, colour] of sketch) {
        ctx.fillStyle = colour
        ctx.fillRect(b.x, b.y, b.w, b.h)
      }
      fx.draw(ctx, t, 0)
    },
  }
}

/** A muncher of burrow 0 standing still on cell (x, y), for the sheet's events that name one. */
function standing(s: State, id: number, x: number, y: number) {
  s.munchers.push({ id, burrow: 0, mode: 'sit', modeAt: 0, cell: cellOf(x, y), toward: cellOf(x, y), stepAt: 0, stepFor: 50, hop: null, homeWhy: null, target: null, tried: [], cheeks: [], grabAt: -1, idleSince: -1, outAt: 0, scout: false, shotBy: -1 })
}
const AREA: Box = { x: 1, y: 1, w: 4, h: 3 }
const cell = (x: number, y: number): readonly [Box, string] => [{ x, y, w: 1, h: 1 }, BUILDING.pad.light]

/** ?sheet=effects: every particle as the events set it off, the song's notes to a burrow, and the hint's ring. */
export const SHEET = (): SheetEntry[] => [
  replaying('dig a blue rock', AREA, 1.2, () => {}, [cell(2, 2)], () => [{ kind: 'dig', cell: cellOf(2, 2), thing: 'blueRock' }]),
  replaying('dig the pond', AREA, 1.2, () => {}, [[{ x: 2, y: 2, w: 1, h: 1 }, LAND.pond]], () => [{ kind: 'dig', cell: cellOf(2, 2), thing: 'bubble' }]),
  replaying('slap: an oven placed', AREA, 1.5, (s) => s.buildings.push(newBuilding(9, 'oven', 2, 1, 0)), [[{ x: 2, y: 1, w: 2, h: 2 }, BUILDING.oven.body]], () => [{ kind: 'place', id: 9, sticker: 'oven' }]),
  replaying('pop: a belt laid', AREA, 1.2, () => {}, [cell(3, 2)], () => [{ kind: 'lay', cells: [cellOf(2, 2), cellOf(3, 2)] }]),
  replaying('sparkles: a bridge', AREA, 1.2, () => {}, [cell(2, 2)], () => [{ kind: 'bridge', cell: cellOf(2, 2) }]),
  replaying('hedge laid', AREA, 1.4, () => {}, [cell(2, 2), cell(3, 2)], () => [{ kind: 'hedgeIn', cells: [cellOf(2, 2), cellOf(3, 2)] }]),
  replaying('a nibble crunch', AREA, 1, () => {}, [[{ x: 3, y: 2, w: 1, h: 1 }, HEDGE.body]], () => [{ kind: 'crunch', cell: cellOf(3, 2) }]),
  replaying('nom crumbs', AREA, 1, (s) => standing(s, 1, 2, 2), [], () => [{ kind: 'nom', id: 1, thing: 'greenBottle', x: 2.5, y: 2.5 }]),
  replaying('burp', AREA, 1, (s) => standing(s, 1, 2, 2), [], () => [{ kind: 'burp', id: 1, x: 2.5, y: 2.5 }]),
  replaying('a-choo', AREA, 1, (s) => standing(s, 1, 2, 2), [], () => [{ kind: 'sneeze', id: 1, x: 2.5, y: 2.5 }]),
  replaying(
    'a tower shoots suds',
    { x: 0, y: 0, w: 5, h: 4 },
    1.2,
    (s) => {
      s.buildings.push(newBuilding(9, 'tower', 1, 2, 0))
      standing(s, 1, 3, 2)
    },
    [[{ x: 1, y: 2, w: 1, h: 1 }, BUILDING.tower.body]],
    () => [{ kind: 'shot', tower: 9, muncher: 1 }],
  ),
  replaying(
    'a gulp: an oven takes a rock from its belt',
    AREA,
    0.8,
    (s) => {
      s.buildings.push(newBuilding(9, 'oven', 3, 2, 0))
      const c = cellOf(2, 2)
      s.belts.in[c] = 2
      s.belts.out[c] = 0
      s.belts.slot[2 * c + 1] = thingIndex('blueRock')
      s.net.mouths.set(9, [2 * c + 1])
    },
    [
      [{ x: 2, y: 2, w: 1, h: 1 }, BELT.body],
      [{ x: 3, y: 2, w: 2, h: 2 }, BUILDING.oven.body],
    ],
    () => [{ kind: 'gulp', id: 9, thing: 'blueRock' }],
  ),
  replaying('suds land on a nose', AREA, 1, (s) => standing(s, 1, 2, 2), [], () => [{ kind: 'suds', id: 1, x: 2.5, y: 2.5 }]),
  replaying('caught, giggle', AREA, 1.2, (s) => standing(s, 1, 2, 2), [], () => [{ kind: 'caught', id: 1 }, { kind: 'giggle', id: 1, x: 2.5, y: 2.5 }]),
  replaying('a picnic', AREA, 1.6, (s) => standing(s, 1, 2, 2), [], () => [{ kind: 'picnic', id: 1, burrow: 0 }]),
  replaying('a friend', { x: 9.5, y: 1, w: 5, h: 4 }, 2, () => {}, [[burrowBox(0), LAND.mound]], () => [{ kind: 'friend', burrow: 0 }]),
  replaying('a muncher hops out', { x: 9.5, y: 1, w: 5, h: 4 }, 1.2, () => {}, [[burrowBox(0), LAND.mound]], () => [{ kind: 'hopOut', id: 1, burrow: 0 }]),
  replaying('tap a tree: a leaf', AREA, 1.6, () => {}, [[{ x: 2, y: 2, w: 1, h: 1 }, LAND.tree]], () => [{ kind: 'poke', what: 'tree', x: 2.5, y: 2.5 }]),
  replaying('tap the flowers: a petal', AREA, 1.6, () => {}, [[{ x: 2, y: 2, w: 1, h: 1 }, LAND.flowerTint]], () => [{ kind: 'poke', what: 'flowers', x: 2.5, y: 2.5 }]),
  replaying('tap the ground: a puff', AREA, 1, () => {}, [], () => [{ kind: 'poke', what: 'ground', x: 2.5, y: 2.5 }]),
  replaying('tap Beep: a tune', AREA, 1.4, () => {}, [], () => [{ kind: 'poke', what: 'beep', x: 2.5, y: 3.5 }]),
  replaying('tap Moony: little stars', AREA, 1, () => {}, [], () => [{ kind: 'poke', what: 'moony', x: 2.5, y: 3.5 }]),
  replaying('a part of the rocket full', { x: 0, y: 2, w: 5, h: 5 }, 2.4, () => {}, [[padBox, BUILDING.pad.body]], () => [{ kind: 'partFull', part: 'legs' }]),
  replaying('liftoff: rainbow puffs', { x: 0, y: 2, w: 5, h: 5 }, 2.4, () => {}, [[padBox, BUILDING.pad.body]], () => [{ kind: 'liftoff' }]),
  replaying('a card: confetti over the land', { x: 0, y: 2, w: 13, h: 8 }, 3, () => {}, [], () => [{ kind: 'card', id: 'gold' }]),
  replaying('good night: an oven tucked in', AREA, 1.5, (s) => s.buildings.push(newBuilding(9, 'oven', 2, 1, 0)), [[{ x: 2, y: 1, w: 2, h: 2 }, BUILDING.oven.body]], () => [{ kind: 'tuck', machine: 'oven' }]),
  replaying(
    "the song: a digger on burrow A's flowers sends notes",
    { x: 8, y: 1, w: 6, h: 4 },
    10,
    (s) => {
      s.found = ['digger', 'gold', 'science', 'gears']
      const d = newBuilding(9, 'digger', 9, 2, 0)
      d.batch = { makes: 'blueRock', at: 0, until: 1e9 }
      const o = newBuilding(10, 'oven', 8, 4, 0)
      o.batch = { makes: 'blueBar', at: 0, until: 1e9 }
      s.buildings.push(d, o)
    },
    [
      [{ x: 9, y: 2, w: 2, h: 2 }, BUILDING.digger.body],
      [{ x: 8, y: 4, w: 2, h: 2 }, BUILDING.oven.body],
      [burrowBox(0), LAND.mound],
    ],
    () => [],
  ),
  holding(
    "a green maker held up by burrow A's flowers: the notes it would send, paler",
    { x: 8, y: 1, w: 6, h: 4 },
    (s) => (s.found = ['digger', 'gold', 'science', 'gears']),
    [
      [{ x: 9, y: 2, w: 2, h: 2 }, BUILDING.greenMaker.light],
      [burrowBox(0), LAND.mound],
    ],
    { sticker: 'greenMaker', x: 9, y: 2 },
  ),
  { label: 'the hint ring (a thing)', box: { x: -0.6, y: -0.6, w: 1.2, h: 1.2 }, draw: (ctx, t) => drawHintRing(ctx, 0.36, t) },
  { label: 'the hint ring (a machine)', box: { x: -1.3, y: -1.3, w: 2.6, h: 2.6 }, draw: (ctx, t) => drawHintRing(ctx, 1.1, t) },
]
