import type { Lang } from '../../../profiles/src/lang'
import type { Frame, Game } from '../game/game'
import { ROOMS } from '../game/levels'
import { RISE_FOR, ROWS, RUN, STEP, STOMP_PAD, TILE, since, ticks, type Room, type Sim } from '../game/model'
import { solidTile, tileAt } from '../game/room'
import { createSim, heroBox } from '../game/sim'
import { drawEnemy, drawKitten, type KittenPose } from './critters'
import { Camera } from './camera'
import { Effects } from './effects'
import { drawHero, hugAt } from './hero'
import { COLOR, pen, toPoint, toWorld, type Rim, type View } from './look'
import { drawBed, drawBlock, drawBubble, drawItem, drawLift, drawPicnic, drawPole, drawSpring, drawStar } from './things'
import { ROOM_LOOK, drawBackdrop, drawPits, drawTerrain } from './world'

/**
 * The picture, one frame at a time: the camera, the terrain baked into chunk canvases, and
 * everything else drawn over it in a fixed order, every body at its place between the last
 * two sim steps. Also the kitten's homecoming, the picnic, the particles and the ?debug
 * overlay. The art is the art files'; this file only places it. No DOM calls here: the
 * stage hands in the canvases.
 */

/** What the stage reads from the game every frame. */
export type Scene = Pick<Game, 'room' | 'sim' | 'generation' | 'screen' | 'paused'>

/** Terrain is baked in chunks this many columns wide and the room's full height. */
const CHUNK = 8
/** At least this many columns always show; on a wide screen the room's rows fill the height instead. */
const MIN_COLS = 20
/** The HUD's star counter: its icon's centre, in CSS pixels from the page's top-left. */
const COUNTER = 44

/** A stomp on the Big Grumble bounces the view down this far (tiles) and back, SHAKE_HZ times a second for SHAKE_FOR. Only down: the sky above row 0 fills in, while above the room's bottom edge nothing would. */
const SHAKE = 0.08
const SHAKE_FOR = 0.2
const SHAKE_HZ = 15

/** The Roof's moonlight round every character, drawn before the character itself. */
const NIGHT_RIM: Rim = { colour: COLOR.nightRim, width: 0.05 }
/** Map stars ripple along a row: this much of a twinkle per column. */
const STAR_RIPPLE = 0.13
/** Dust: behind her feet every RUN_DUST_EVERY while she runs on the ground faster than RUN_DUST of RUN, at her front foot every SKID_DUST_EVERY while she skids. */
const RUN_DUST_EVERY = 0.15
const RUN_DUST = 0.9
const SKID_DUST_EVERY = 0.07

/** The homecoming: the kitten pops out of the doorway over POP_FOR in an arc POP_HIGH tall, landing POP_OUT in front of the bed, then hops into her arms over HOP_FOR in an arc HOP_HIGH over the straight line. In the hop its feet are HUG_FEET below the point her arms will hold it at. */
const POP_FOR = 0.3
const POP_HIGH = 0.8
const POP_OUT = 0.7
const HOP_FOR = 0.5
const HOP_HIGH = 0.7
const HUG_FEET = 0.3

/**
 * The picnic beside the bed. drawPicnic's blanket is 6 wide with a lantern post 3.3 either
 * side of its middle, more than the floor between the ABC staircase and the bed gives, so
 * the blanket starts PICNIC_POST past the staircase and runs on behind the bed (which is
 * drawn over it), its middle never closer to the bed than PICNIC_CAKE so the cake stays in
 * front of the bed's side. Pia stands on the blanket's left end; three kittens dance on the
 * blanket and two on the floor past the bed, each as [x from the blanket's middle or the
 * bed's foot, feet y, facing, beat (seconds ahead in its dance)], back row first.
 */
const PICNIC_POST = 0.3
const PICNIC_HALF = 3.3
const PICNIC_CAKE = 2.7
const PICNIC_PIA = -2.35
const PICNIC_ON_BLANKET = [
  [-1.5, -0.32, 1, 0],
  [-0.98, -0.04, 1, 0.21],
] as const
const PICNIC_BY_BED = [
  [-1.62, -0.06, -1, 0.37],
  [1.82, -0.02, -1, 0.12],
  [2.57, -0.22, -1, 0.29],
] as const
/** On a screen the room's rows fill, the picnic's view sits this many rows higher, so the party stands clear of the HUD's row of kitten pictures along the bottom. */
const PICNIC_LIFT = 2
/** At the picnic Pia hops for joy every PICNIC_HOP_EVERY seconds; confetti flies about every PICNIC_CONFETTI and a heart rises about every PICNIC_HEART. */
const PICNIC_HOP_EVERY = 2.4
const PICNIC_CONFETTI = 2.6
const PICNIC_HEART = 1.1

/** The calm floor under the room on a narrow screen, where the thumbs' controls sit, is the room's card colour; its top edge fades in over STRIP_EDGE tiles of the room's bottom. */
const STRIP_EDGE = 0.4

/** ?debug's colours (Pia, enemies, items, bubbles, the grid, the camera's anchor, the numbers) and the stomp line's dashes (tiles). */
const DEBUG = { hero: '#2BB673', enemy: '#E8384F', item: '#E6B800', bubble: '#2F7BEA', grid: 'rgba(59, 34, 69, 0.22)', anchor: 'rgba(232, 56, 79, 0.6)', text: '#3B2245' } as const
const DASH = [0.12, 0.08]
const NO_DASH: number[] = []

/** k of the way from a to b. */
const lerp = (a: number, b: number, k: number) => a + (b - a) * k
/** x held between lo and hi. */
const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi)

/** A canvas holding the baked terrain of chunk k (the columns from CHUNK k on), or nothing yet (k = -1), and the first row anything is drawn in: the sky above it is never blitted. */
interface Chunk {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  k: number
  top: number
}

/** The picnic laid out in a room: its own sim (Pia beside the cake, the gate sunk away, no enemies; only the picture reads it), the blanket's middle, the bed's foot. */
interface Party {
  sim: Sim
  blanket: number
  bedX: number
  floor: number
}

/** Lays the picnic out beside the bed of `room` (the Roof). */
function party(room: Room): Party {
  const bedX = room.bed.col + 0.5
  const floor = room.bed.row + 1
  // The first column of the bed's floor past whatever stands on it to the left: the ABC staircase.
  let free = room.bed.col
  while (free > 0 && room.floor[free - 1] === floor && !solidTile(tileAt(room, free - 1, floor - 1))) free--
  const blanket = Math.min(free + PICNIC_POST + PICNIC_HALF, bedX - PICNIC_CAKE)
  const s = createSim(room)
  const h = s.hero
  h.form = 'big'
  ;[h.w, h.h] = heroBox('big')
  h.x = h.px = blanket + PICNIC_PIA
  h.y = h.py = floor
  h.facing = 1
  for (const e of s.enemies) e.state = 'gone'
  room.blocks.forEach((def, i) => {
    if (def.kind === 'gate') s.blocks[i]!.state = 'open'
  })
  s.phase = 'walk'
  return { sim: s, blanket, bedX, floor }
}

/**
 * Draws the game on one canvas. `makeCanvas` gives a fresh offscreen canvas for the chunk
 * pool (allocated on resize only); `lang` is the player's, for the ABC blocks' words;
 * `debug` turns on the overlay.
 */
export class Renderer {
  private view: View = { width: 1, height: 1, tile: 1, left: 0, top: 0 }
  /** Device pixels per CSS pixel. */
  private scale = 1
  /** The room's rows fill the canvas's height (a landscape screen), and the device-pixel y of the room's top edge when nothing shakes. */
  private fills = true
  private top = 0
  private chunks: Chunk[] = []
  private room: Room | null = null
  /** A sim of the room with every block whole: the cookie bits draw from it. */
  private still: Sim | null = null
  /** The picnic, on the picnic screen. */
  private party: Party | null = null
  private generation = -1
  /** Real seconds drawn (they stop while paused), and the clock when this sim began. */
  private clock = 0
  private began = 0
  private camera = new Camera()
  private effects = new Effects()
  /** The clock of the last Big Grumble stomp. */
  private shakeAt = -Infinity
  /** Seconds to the next puff of dust at her feet. */
  private dustIn = 0
  /** The kitten is in her arms (its hearts have risen). */
  private hugged = false
  /** The picnic's next confetti and heart, on the clock. */
  private confettiAt = 0
  private heartAt = 0
  /** Something changed that the picture on the canvas does not show yet. */
  private dirty = true
  /** ?debug: a smoothed frame time for the fps. */
  private frameTime = 1 / 60

  constructor(
    private ctx: CanvasRenderingContext2D,
    private makeCanvas: () => HTMLCanvasElement,
    private lang: Lang,
    private debug: boolean,
  ) {}

  /** The canvas is now `width` by `height` device pixels, `scale` of them per CSS pixel: a new tile size, and a chunk pool to match. */
  resize(width: number, height: number, scale: number): void {
    const v = this.view
    v.width = width
    v.height = height
    v.tile = Math.max(1, Math.floor(Math.min(height / ROWS, width / MIN_COLS)))
    // When the rows fill the height, the few pixels left over go to the sky above row 0; on a narrow screen the room sits at the top and the strip fills the rest.
    this.fills = height / ROWS <= width / MIN_COLS
    this.top = this.fills ? height - ROWS * v.tile : 0
    this.scale = scale
    const want = Math.ceil(width / v.tile / CHUNK) + 2
    while (this.chunks.length < want) {
      const canvas = this.makeCanvas()
      this.chunks.push({ canvas, ctx: canvas.getContext('2d')!, k: -1, top: 0 })
    }
    while (this.chunks.length > want) {
      const c = this.chunks.pop()!
      c.canvas.width = c.canvas.height = 0
    }
    for (const c of this.chunks) {
      c.canvas.width = CHUNK * v.tile
      c.canvas.height = ROWS * v.tile
      c.k = -1
    }
    this.dirty = true
  }

  /** The letters' font has loaded: bake every chunk again. */
  invalidate(): void {
    for (const c of this.chunks) c.k = -1
    this.dirty = true
  }

  /** Lets go of the chunk canvases: the stage is gone. */
  dispose(): void {
    for (const c of this.chunks) c.canvas.width = c.canvas.height = 0
    this.chunks = []
  }

  /** A new sim (a visit, the cards, the picnic): the camera, the particles and the moments start over; a new room is baked anew. */
  private start(game: Scene): void {
    const room = game.room
    this.generation = game.generation
    if (room !== this.room) {
      this.room = room
      this.still = createSim(room)
      for (const c of this.chunks) c.k = -1
    }
    this.began = this.clock
    this.effects.clear()
    this.shakeAt = -Infinity
    this.dustIn = 0
    this.hugged = false
    this.party = game.screen === 'picnic' ? party(room) : null
    this.confettiAt = this.clock + 0.4
    this.heartAt = this.clock + 0.8
    const viewCols = this.view.width / this.view.tile
    if (game.screen === 'play') this.camera.reset(game.sim.hero.x, viewCols, room.cols)
    else this.camera.x = 0
    this.dirty = true
  }

  /** Draws one frame of the game: `f` is what this frame's `advance` did, `seconds` the real time it covered. */
  draw(game: Scene, f: Frame, seconds: number): void {
    if (game.generation !== this.generation) this.start(game)
    // Paused, nothing moves: the picture already on the canvas is the right one.
    if (game.paused && f.steps === 0 && !this.dirty) return
    this.dirty = false
    const { ctx, view: v } = this
    const room = game.room
    const night = ROOM_LOOK[room.id].night
    const dt = game.paused ? 0 : seconds
    this.clock += dt
    if (seconds > 0) this.frameTime += (seconds - this.frameTime) * 0.1
    const picnic = game.screen === 'picnic'
    const s = picnic ? this.party!.sim : game.sim
    const h = s.hero
    const alpha = picnic ? 1 : f.alpha
    const t = game.screen === 'play' ? (s.tick - 1 + alpha) * STEP : this.clock - this.began
    if (picnic) this.picnicMoments(this.party!, t)
    const hx = lerp(h.px, h.x, alpha)
    const hy = lerp(h.py, h.y, alpha)
    const viewCols = v.width / v.tile

    // What happened, and the dust her feet kick up.
    for (let i = 0; i < f.events.length; i++) {
      const e = f.events[i]!
      if (e.kind === 'bossHit') this.shakeAt = this.clock
      this.effects.spawn(e, room)
    }
    if (game.screen === 'play' && s.phase === 'play' && h.grounded && dt > 0) {
      const skid = h.skidding
      if (skid || Math.abs(h.vx) > RUN_DUST * RUN) {
        this.dustIn -= dt
        if (this.dustIn <= 0) {
          this.dustIn = skid ? SKID_DUST_EVERY : RUN_DUST_EVERY
          const way = Math.sign(h.vx)
          if (skid) this.effects.dust(hx + way * h.w * 0.45, hy, way * 1.2, 0.8)
          else this.effects.dust(hx - way * h.w * 0.5, hy, -way * 0.6, 1)
        }
      } else this.dustIn = 0
    }
    this.effects.update(dt)

    // The camera, rounded to a whole device pixel once for everything.
    const before = this.camera.x
    if (game.screen === 'play') this.camera.follow(hx, (h.x - h.px) / STEP, s.phase === 'play', dt, viewCols, room.cols)
    else if (game.screen === 'rooms') this.camera.drift(dt, viewCols, room.cols)
    else this.camera.x = clamp((this.party!.blanket - PICNIC_HALF + this.party!.bedX + PICNIC_BY_BED[2][0]) / 2 - viewCols / 2, 0, Math.max(0, room.cols - viewCols))
    const leftPx = Math.round(this.camera.x * v.tile)
    v.left = leftPx / v.tile
    const shaking = this.clock - this.shakeAt
    v.top = this.top - (picnic && this.fills ? PICNIC_LIFT * v.tile : 0) + (shaking < SHAKE_FOR ? Math.round(SHAKE * (1 - shaking / SHAKE_FOR) * Math.abs(Math.sin(Math.PI * SHAKE_HZ * shaking)) * v.tile) : 0)
    pen.px = v.tile

    // The terrain chunks this view needs, and one more the way the camera goes.
    const k0 = Math.floor(v.left / CHUNK)
    const k1 = Math.floor((v.left + viewCols - 1e-6) / CHUNK)
    const travel = this.camera.x - before
    this.bakeChunks(room, k0, k1, travel > 0 ? k1 + 1 : travel < 0 ? k0 - 1 : -1)

    // 1 and 2: the backdrop, the pits, the terrain.
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    drawBackdrop(ctx, room, v, t)
    const col0 = Math.floor(v.left)
    const col1 = Math.ceil(v.left + viewCols)
    toWorld(ctx, v)
    drawPits(ctx, room, col0 - 1, col1 + 1, t)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    for (let i = 0; i < this.chunks.length; i++) {
      const c = this.chunks[i]!
      if (c.k < k0 || c.k > k1) continue
      const y = c.top * v.tile
      ctx.drawImage(c.canvas, 0, y, c.canvas.width, c.canvas.height - y, c.k * CHUNK * v.tile - leftPx, v.top + y, c.canvas.width, c.canvas.height - y)
    }

    // 3: lifts, springs, blocks, the map's stars.
    const x0 = v.left - 2
    const x1 = v.left + viewCols + 2
    for (let i = 0; i < room.lifts.length; i++) {
      const def = room.lifts[i]!
      const l = s.lifts[i]!
      const x = lerp(l.px, l.x, alpha)
      if (x + def.width / 2 < x0 || x - def.width / 2 > x1) continue
      toPoint(ctx, v, x, lerp(l.py, l.y, alpha), 1)
      drawLift(ctx, room, def, t)
    }
    for (let i = 0; i < room.springs.length; i++) {
      const c = room.springs[i]!
      if (c.col < x0 || c.col > x1) continue
      toPoint(ctx, v, c.col + 0.5, c.row + 1, 1)
      drawSpring(ctx, room, s.springs[i]!, t)
    }
    for (let i = 0; i < room.blocks.length; i++) {
      const b = room.blocks[i]!
      if (b.col < x0 || b.col > x1) continue
      toPoint(ctx, v, b.col, b.row, 1)
      drawBlock(ctx, room, i, s, t)
    }
    for (let i = 0; i < room.stars.length; i++) {
      const c = room.stars[i]!
      if (s.taken[i] || c.col < x0 || c.col > x1) continue
      toPoint(ctx, v, c.col + 0.5, c.row + 0.5, 1)
      drawStar(ctx, t, c.col * STAR_RIPPLE)
    }

    // 4: power-ups, clipped to above their box while they rise out of it.
    for (let i = 0; i < s.items.length; i++) {
      const it = s.items[i]!
      const x = lerp(it.px, it.x, alpha)
      if (!it.alive || x < x0 || x > x1) continue
      const rising = since(it.bornAt, t) < RISE_FOR
      if (rising) {
        // It rises one tile over RISE_FOR from level with its box's top (sim.ts), which gives the box's top back.
        const top = Math.round(it.y - it.h + (s.tick - it.bornAt) / ticks(RISE_FOR))
        ctx.save()
        toWorld(ctx, v)
        ctx.beginPath()
        ctx.rect(x0, top - ROWS, x1 - x0, ROWS)
        ctx.clip()
      }
      toPoint(ctx, v, x, lerp(it.py, it.y, alpha), it.facing)
      drawItem(ctx, it, room, t)
      if (rising) ctx.restore()
    }

    // 5: the pole, the bed and its kitten; at the picnic, the picnic and the bed over it.
    if (picnic) this.picnicScene(this.party!, room, t, night)
    else {
      toPoint(ctx, v, room.pole.col + 0.5, room.pole.row + 1, 1)
      drawPole(ctx, room, s, t)
      this.homecoming(s, room, t, hx, hy, night)
    }

    // 6: enemies, Pia, her bubbles; on a night room each character twice, the moonlight rim first.
    for (let i = 0; i < s.enemies.length; i++) {
      const e = s.enemies[i]!
      const x = lerp(e.px, e.x, alpha)
      if (e.state === 'gone' || x < x0 - 2 || x > x1 + 2) continue
      const y = lerp(e.py, e.y, alpha)
      toPoint(ctx, v, x, y, e.facing)
      if (night) drawEnemy(ctx, e, t, NIGHT_RIM)
      drawEnemy(ctx, e, t, null)
    }
    if (!picnic) {
      toPoint(ctx, v, hx, hy, h.facing)
      if (night) drawHero(ctx, s, t, NIGHT_RIM)
      drawHero(ctx, s, t, null)
    }
    for (let i = 0; i < s.bubbles.length; i++) {
      const b = s.bubbles[i]!
      if (!b.alive) continue
      toPoint(ctx, v, lerp(b.px, b.x, alpha), lerp(b.py, b.y, alpha), 1)
      drawBubble(ctx, b, t)
    }

    // The calm floor under the room on a narrow screen, over anything that fell out of the room.
    this.strip(room, picnic)

    // 7: the particles, then ?debug.
    this.effects.draw(ctx, v, room, this.still!, t, COUNTER * this.scale, COUNTER * this.scale)
    if (this.debug) this.overlay(s, f, alpha, viewCols)
  }

  /** Bakes the chunks k0 to k1 that no canvas holds yet, and chunk `ahead` if a canvas is free for it. */
  private bakeChunks(room: Room, k0: number, k1: number, ahead: number): void {
    const last = Math.ceil(room.cols / CHUNK) - 1
    for (let k = Math.max(0, k0); k <= Math.min(last, k1); k++) {
      if (this.held(k)) continue
      const c = this.free(k0, k1)
      if (!c) throw new Error(`no chunk canvas free for chunk ${k} with ${this.chunks.length} in the pool`)
      this.bake(room, c, k)
    }
    if (ahead < 0 || ahead > last || this.held(ahead)) return
    const c = this.free(k0, k1)
    if (c) this.bake(room, c, ahead)
  }

  /** A canvas holds chunk k. */
  private held(k: number): boolean {
    for (let i = 0; i < this.chunks.length; i++) if (this.chunks[i]!.k === k) return true
    return false
  }

  /** An empty canvas, or the one holding the chunk furthest from the view; never one in view. */
  private free(k0: number, k1: number): Chunk | null {
    let best: Chunk | null = null
    let far = -1
    for (let i = 0; i < this.chunks.length; i++) {
      const c = this.chunks[i]!
      if (c.k >= k0 && c.k <= k1) continue
      const d = c.k < 0 ? Infinity : Math.min(Math.abs(c.k - k0), Math.abs(c.k - k1))
      if (d > far) {
        far = d
        best = c
      }
    }
    return best
  }

  /** Chunk k into canvas c: its own columns in world units, with one column more on each side so whatever overhangs into it shows. */
  private bake(room: Room, c: Chunk, k: number): void {
    // The highest tile it draws, less a row: nothing drawn for a tile reaches more than half a tile past it.
    let top = ROWS
    for (let col = Math.max(0, k * CHUNK - 1); col < Math.min(room.cols, k * CHUNK + CHUNK + 1); col++) {
      for (let row = 0; row < top; row++) {
        if (room.tiles[row * room.cols + col] !== TILE.air) top = row
      }
    }
    c.top = Math.max(0, top - 1)
    const tile = this.view.tile
    const g = c.ctx
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.clearRect(0, 0, c.canvas.width, c.canvas.height)
    g.setTransform(tile, 0, 0, tile, -k * CHUNK * tile, 0)
    g.save()
    g.beginPath()
    g.rect(k * CHUNK, 0, CHUNK, ROWS)
    g.clip()
    drawTerrain(g, room, this.lang, k * CHUNK - 1, k * CHUNK + CHUNK + 1)
    g.restore()
    c.k = k
  }

  /** The bed and the kitten: hidden in the doorway, then popping out, hopping to her and staying in her arms. */
  private homecoming(s: Sim, room: Room, t: number, hx: number, hy: number, night: boolean): void {
    const { ctx, view: v } = this
    const bx = room.bed.col + 0.5
    const by = room.bed.row + 1
    // Seconds since the kitten came out, Infinity once the visit is done, -1 before.
    const out = s.phase === 'done' ? Infinity : s.phase === 'found' ? Math.max(0, since(s.phaseAt, t)) : -1
    toPoint(ctx, v, bx, by, 1)
    drawBed(ctx, room, out < 0 ? 0 : Math.min(1, out / POP_FOR), t)
    if (out < 0) {
      drawKitten(ctx, room.kitten, 'hidden', t, null)
      return
    }
    const h = s.hero
    const arms = hugAt(h.form)
    const hugX = hx + h.facing * arms[0]
    const hugY = hy + arms[1]
    let x = hugX
    let y = hugY
    let pose: KittenPose = 'hug'
    let facing = h.facing
    if (out < POP_FOR + HOP_FOR) {
      pose = 'hop'
      facing = hugX < bx ? -1 : 1
      const outX = bx + facing * POP_OUT
      if (out < POP_FOR) {
        const k = out / POP_FOR
        x = lerp(bx, outX, k)
        y = by - POP_HIGH * 4 * k * (1 - k)
      } else {
        const k = (out - POP_FOR) / HOP_FOR
        x = lerp(outX, hugX, k)
        y = lerp(by, hugY + HUG_FEET, k) - HOP_HIGH * 4 * k * (1 - k)
      }
    } else if (!this.hugged) {
      this.hugged = true
      this.effects.hearts(hugX, hugY - 0.5, 3)
    }
    toPoint(ctx, v, x, y, facing)
    if (night) drawKitten(ctx, room.kitten, pose, t, NIGHT_RIM)
    drawKitten(ctx, room.kitten, pose, t, null)
  }

  /** The picnic's sim follows the picture's clock: Pia hops for joy now and then and beams between; confetti and hearts now and then. */
  private picnicMoments(p: Party, t: number): void {
    const s = p.sim
    s.tick = Math.floor(t / STEP) + 1
    const cycle = t % PICNIC_HOP_EVERY
    if (cycle < 0.7) {
      s.phase = 'found'
      s.phaseAt = Math.round((t - cycle) / STEP)
    } else s.phase = 'walk'
    if (this.clock >= this.confettiAt) {
      this.confettiAt = this.clock + PICNIC_CONFETTI * (0.7 + 0.6 * Math.random())
      this.effects.confetti(lerp(p.blanket - PICNIC_HALF, p.bedX + PICNIC_BY_BED[2][0], Math.random()), p.floor - 3.5 - Math.random(), 24)
    }
    if (this.clock >= this.heartAt) {
      this.heartAt = this.clock + PICNIC_HEART * (0.7 + 0.6 * Math.random())
      const i = Math.floor(Math.random() * (PICNIC_ON_BLANKET.length + PICNIC_BY_BED.length))
      const x = i < PICNIC_ON_BLANKET.length ? p.blanket + PICNIC_ON_BLANKET[i]![0] : p.bedX + PICNIC_BY_BED[i - PICNIC_ON_BLANKET.length]![0]
      this.effects.hearts(x, p.floor - 1, 1)
    }
  }

  /** The picnic: the blanket, the cake and the lanterns, the bed over the blanket's far end, Pia, and the five kittens dancing. */
  private picnicScene(p: Party, room: Room, t: number, night: boolean): void {
    const { ctx, view: v } = this
    const s = p.sim
    const h = s.hero
    toPoint(ctx, v, p.blanket, p.floor, 1)
    drawPicnic(ctx, t)
    toPoint(ctx, v, p.bedX, p.floor, 1)
    drawBed(ctx, room, 1, t)
    toPoint(ctx, v, h.x, h.y, h.facing)
    if (night) drawHero(ctx, s, t, NIGHT_RIM)
    drawHero(ctx, s, t, null)
    for (let i = 0; i < ROOMS.length; i++) {
      const onBlanket = i < PICNIC_ON_BLANKET.length
      const k = onBlanket ? PICNIC_ON_BLANKET[i]! : PICNIC_BY_BED[i - PICNIC_ON_BLANKET.length]!
      toPoint(ctx, v, (onBlanket ? p.blanket : p.bedX) + k[0], p.floor + k[1], k[2])
      const name = ROOMS[i]!.kitten
      if (night) drawKitten(ctx, name, 'dance', t + k[3], NIGHT_RIM)
      drawKitten(ctx, name, 'dance', t + k[3], null)
    }
  }

  /** Under the room where it does not fill the height (a narrow screen, the lifted picnic): the calm floor, in the room's colour, fading in over the room's bottom edge. */
  private strip(room: Room, lifted: boolean): void {
    const { ctx, view: v } = this
    if (this.fills && !lifted) return
    const bottom = v.top + ROWS * v.tile
    const edge = Math.round(STRIP_EDGE * v.tile)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = ROOM_LOOK[room.id].card
    // The soft edge: a few steps of rising alpha instead of a gradient.
    const steps = 5
    for (let i = 0; i < steps; i++) {
      ctx.globalAlpha = (i + 1) / (steps + 1)
      ctx.fillRect(0, bottom - edge + (i * edge) / steps, v.width, edge / steps)
    }
    ctx.globalAlpha = 1
    ctx.fillRect(0, bottom, v.width, v.height - bottom)
  }

  /** ?debug: the grid, every hitbox, the stomp line at each enemy's middle, the camera's anchor, and a line of numbers. */
  private overlay(s: Sim, f: Frame, alpha: number, viewCols: number): void {
    const { ctx, view: v } = this
    toWorld(ctx, v)
    ctx.beginPath()
    for (let c = Math.ceil(v.left); c <= v.left + viewCols; c++) {
      ctx.moveTo(c, 0)
      ctx.lineTo(c, ROWS)
    }
    for (let r = 0; r <= ROWS; r++) {
      ctx.moveTo(v.left, r)
      ctx.lineTo(v.left + viewCols, r)
    }
    ctx.lineWidth = 1 / v.tile
    ctx.strokeStyle = DEBUG.grid
    ctx.stroke()
    ctx.lineWidth = 2 / v.tile
    const h = s.hero
    this.hitbox(lerp(h.px, h.x, alpha), lerp(h.py, h.y, alpha), h.w, h.h, DEBUG.hero)
    for (const e of s.enemies) {
      if (e.state === 'gone') continue
      const x = lerp(e.px, e.x, alpha)
      const y = lerp(e.py, e.y, alpha)
      this.hitbox(x, y, e.w, e.h, DEBUG.enemy)
      // Her feet at the start of a step at or above this line, inside its stomp box, is a stomp.
      ctx.setLineDash(DASH)
      ctx.beginPath()
      ctx.moveTo(x - e.w / 2 - STOMP_PAD, y - e.h / 2)
      ctx.lineTo(x + e.w / 2 + STOMP_PAD, y - e.h / 2)
      ctx.strokeStyle = DEBUG.hero
      ctx.stroke()
      ctx.setLineDash(NO_DASH)
    }
    for (const it of s.items) if (it.alive) this.hitbox(lerp(it.px, it.x, alpha), lerp(it.py, it.y, alpha), it.w, it.h, DEBUG.item)
    for (const b of s.bubbles) if (b.alive) this.hitbox(lerp(b.px, b.x, alpha), lerp(b.py, b.y, alpha), b.w, b.h, DEBUG.bubble)
    const ax = v.left + this.camera.anchor * viewCols
    ctx.beginPath()
    ctx.moveTo(ax, 0)
    ctx.lineTo(ax, ROWS)
    ctx.strokeStyle = DEBUG.anchor
    ctx.stroke()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    const k = this.scale
    const text = `fps ${(1 / this.frameTime).toFixed(0)}  dpr ${k.toFixed(2)}  tile ${v.tile}  steps ${f.steps}  x ${h.x.toFixed(2)}  y ${h.y.toFixed(2)}  vx ${h.vx.toFixed(2)}  vy ${h.vy.toFixed(2)}  ${h.form}  ${h.grounded ? 'grounded' : 'air'}  ${s.phase}`
    const size = Math.round(13 * k)
    ctx.font = `600 ${size}px ui-monospace, monospace`
    ctx.textBaseline = 'top'
    // Under the HUD's top row.
    const y = Math.round(96 * k)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'
    ctx.fillRect(8 * k, y - 4 * k, ctx.measureText(text).width + 12 * k, size + 8 * k)
    ctx.fillStyle = DEBUG.text
    ctx.fillText(text, 14 * k, y)
  }

  /** A body's box, its feet centre at (x, y), in world units. */
  private hitbox(x: number, y: number, w: number, h: number, colour: string): void {
    this.ctx.strokeStyle = colour
    this.ctx.strokeRect(x - w / 2, y - h, w, h)
  }
}
