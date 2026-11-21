import { Camera } from '../../../pia-jump/src/draw/camera'
import { COLOR, bubbleBall, groundShadow, pen, toPoint, toWorld, type Rim, type View } from '../../../pia-jump/src/draw/look'
import { ROOM_LOOK, drawBackdrop, drawPits, drawTerrain } from '../../../pia-jump/src/draw/world'
import { ROWS, RUN, STEP, since } from '../../../pia-jump/src/game/model'
import type { Frame, Game } from '../game/game'
import type { Level, Sim } from '../game/model'
import { buildSpot } from '../game/sim'
import { drawCrate, drawFinish, drawGhost, drawPiece, drawPresent } from './blocks'
import { Effects } from './effects'
import { drawPerson, type Act, type Pose } from './person'

/**
 * The picture, one frame at a time: Pia Jump's camera, backdrop, pits and terrain (baked
 * into chunk canvases), then Super Me's things over them in a fixed order, the person at her
 * place between the last two sim steps, and the particles. The art is the art files'; this
 * file only places it. No DOM calls here: the stage hands in the canvases.
 */

/** What the stage reads from the game every frame. */
export type Scene = Pick<Game, 'level' | 'sim' | 'look' | 'generation' | 'screen' | 'paused'>

/** Terrain is baked in chunks this many columns wide and the level's full height. */
const CHUNK = 8
/** At least this many columns always show; on a wide screen the level's rows fill the height instead. */
const MIN_COLS = 20
/** The Roof's moonlight round the person, drawn before the person itself. */
const NIGHT_RIM: Rim = { colour: COLOR.nightRim, width: 0.05 }
/** The build swing shows this long after a block goes down; a landing squashes her for SQUASH_FOR. */
const BUILD_FOR = 0.3
const SQUASH_FOR = 0.18
/** The rescue bubble round her. */
const BUBBLE_R = 1.15
/** At the finish, confetti flies about this often. */
const CONFETTI_EVERY = 0.7

const lerp = (a: number, b: number, k: number) => a + (b - a) * k

/** What her body is doing, read off the sim. */
function poseOf(s: Sim, t: number): Pose {
  const h = s.hero
  let act: Act = 'stand'
  let from = 0
  if (s.phase === 'finish' || s.phase === 'done') {
    act = 'dance'
    from = s.phaseAt * STEP
  } else if (s.phase === 'rescue') act = 'fall'
  else if (h.climbing) act = 'climb'
  else if (since(h.builtAt, t) < BUILD_FOR) {
    act = 'build'
    from = h.builtAt * STEP
  } else if (!h.grounded) act = h.vy < 0 ? 'jump' : 'fall'
  else if (Math.abs(h.vx) > RUN * 0.9) act = 'run'
  else if (Math.abs(h.vx) > 0.2) act = 'walk'
  const landed = since(h.landedAt, t)
  return { act, stride: h.stride, since: Math.max(0, t - from), t, squash: landed < SQUASH_FOR ? 1 - landed / SQUASH_FOR : 0, turn: 1 }
}

interface Chunk {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  k: number
}

export class Renderer {
  private view: View = { width: 1, height: 1, tile: 1, left: 0, top: 0 }
  /** The level's rows fill the canvas's height (a landscape screen). */
  private fills = true
  private chunks: Chunk[] = []
  private level: Level | null = null
  private generation = -1
  /** Real seconds drawn (they stop while paused), and the clock when this sim began. */
  private clock = 0
  private began = 0
  private camera = new Camera()
  private effects = new Effects()
  private confettiAt = 0
  /** Something changed that the picture on the canvas does not show yet. */
  private dirty = true

  constructor(
    private ctx: CanvasRenderingContext2D,
    private makeCanvas: () => HTMLCanvasElement,
  ) {}

  /** The canvas is now `width` by `height` device pixels: a new tile size, and a chunk pool to match. */
  resize(width: number, height: number): void {
    const v = this.view
    v.width = width
    v.height = height
    v.tile = Math.max(1, Math.floor(Math.min(height / ROWS, width / MIN_COLS)))
    this.fills = height / ROWS <= width / MIN_COLS
    v.top = this.fills ? height - ROWS * v.tile : 0
    const want = Math.ceil(width / v.tile / CHUNK) + 2
    while (this.chunks.length < want) {
      const canvas = this.makeCanvas()
      this.chunks.push({ canvas, ctx: canvas.getContext('2d')!, k: -1 })
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

  dispose(): void {
    for (const c of this.chunks) c.canvas.width = c.canvas.height = 0
    this.chunks = []
  }

  private start(game: Scene): void {
    this.generation = game.generation
    if (game.level !== this.level) {
      this.level = game.level
      for (const c of this.chunks) c.k = -1
    }
    this.began = this.clock
    this.effects.clear()
    const viewCols = this.view.width / this.view.tile
    if (game.screen === 'play') this.camera.reset(game.sim.hero.x, viewCols, game.level.cols)
    else this.camera.x = 0
    this.dirty = true
  }

  /** Draws one frame: `f` is what this frame's `advance` did, `seconds` the real time it covered. */
  draw(game: Scene, f: Frame, seconds: number): void {
    if (game.generation !== this.generation) this.start(game)
    if (game.paused && f.steps === 0 && !this.dirty) return
    this.dirty = false
    const { ctx, view: v } = this
    const level = game.level
    const s = game.sim
    const h = s.hero
    const play = game.screen === 'play'
    const dt = game.paused ? 0 : seconds
    this.clock += dt
    const alpha = f.alpha
    const t = play ? (s.tick - 1 + alpha) * STEP : this.clock - this.began
    const hx = lerp(h.px, h.x, alpha)
    const hy = lerp(h.py, h.y, alpha)
    const viewCols = v.width / v.tile

    for (let i = 0; i < f.events.length; i++) this.effects.spawn(f.events[i]!)
    if (play && s.phase === 'finish' && this.clock >= this.confettiAt) {
      this.confettiAt = this.clock + CONFETTI_EVERY
      this.effects.confetti(hx + (Math.random() - 0.5) * 4, hy - 3)
    }
    this.effects.update(dt)

    if (play) this.camera.follow(hx, (h.x - h.px) / STEP, s.phase === 'play', dt, viewCols, level.cols)
    else this.camera.drift(dt, viewCols, level.cols)
    const leftPx = Math.round(this.camera.x * v.tile)
    v.left = leftPx / v.tile
    pen.px = v.tile

    // The backdrop, the pits, the terrain chunks this view needs (and one more ahead).
    const k0 = Math.floor(v.left / CHUNK)
    const k1 = Math.floor((v.left + viewCols - 1e-6) / CHUNK)
    this.bakeChunks(level, k0, k1)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    drawBackdrop(ctx, level, v, t)
    const col0 = Math.floor(v.left)
    const col1 = Math.ceil(v.left + viewCols)
    toWorld(ctx, v)
    drawPits(ctx, level, col0 - 1, col1 + 1, t)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    for (const c of this.chunks) {
      if (c.k < k0 || c.k > k1) continue
      ctx.drawImage(c.canvas, c.k * CHUNK * v.tile - leftPx, v.top)
    }

    // Her blocks, the ghost of the next one, the crates, the presents, the arch.
    const x0 = v.left - 3
    const x1 = v.left + viewCols + 3
    s.pieces.forEach((p, i) => {
      if (p.col + p.size < x0 || p.col > x1) return
      toPoint(ctx, v, p.col, p.row, 1)
      const used = since(p.usedAt, t)
      drawPiece(ctx, p.kind, p.size, i, used < 0.25 ? 1 - used / 0.25 : 0)
    })
    if (play && s.phase === 'play' && !game.paused && s.hand[s.chosen] > 0) {
      const spot = buildSpot(s, level, s.chosen)
      if (spot) {
        toPoint(ctx, v, spot.col, spot.row, 1)
        drawGhost(ctx, s.chosen, spot.size, this.clock)
      }
    }
    level.crates.forEach((c, i) => {
      if (s.taken[i] || c.col < x0 || c.col > x1) return
      toPoint(ctx, v, c.col + 0.5, c.row + 0.5, 1)
      drawCrate(ctx, c.kind, t, c.col)
    })
    level.presents.forEach((p, i) => {
      if (s.opened[i] || p.col < x0 || p.col > x1) return
      toPoint(ctx, v, p.col + 0.5, p.row + 0.5, 1)
      drawPresent(ctx, i, t)
    })
    toPoint(ctx, v, level.finish.col + 0.5, level.finish.row + 1, 1)
    drawFinish(ctx, t)

    // The person, on a night level twice, the moonlight rim first; in the rescue bubble when she fell.
    if (play) {
      toPoint(ctx, v, hx, hy, h.facing)
      if (h.grounded) groundShadow(ctx, h.w)
      const pose = poseOf(s, t)
      if (ROOM_LOOK[level.id].night) drawPerson(ctx, game.look, pose, NIGHT_RIM)
      drawPerson(ctx, game.look, pose, null)
      if (s.phase === 'rescue') {
        toPoint(ctx, v, hx, hy - h.h / 2, 1)
        bubbleBall(ctx, BUBBLE_R, t)
      }
    }

    // The floor under the level on a narrow screen, then the particles.
    if (!this.fills) {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.fillStyle = ROOM_LOOK[level.id].card
      ctx.fillRect(0, v.top + ROWS * v.tile, v.width, v.height - v.top - ROWS * v.tile)
    }
    toWorld(ctx, v)
    this.effects.draw(ctx)
  }

  /** Bakes the chunks k0 to k1 that no canvas holds yet, then the next one either side into a canvas holding nothing nearer, so neither pushes the other out frame after frame. */
  private bakeChunks(level: Level, k0: number, k1: number): void {
    const last = Math.ceil(level.cols / CHUNK) - 1
    const wanted = (k: number) => k >= 0 && k <= last && !this.chunks.some((c) => c.k === k)
    for (let k = Math.max(0, k0); k <= Math.min(last, k1); k++) {
      if (!wanted(k)) continue
      const c = this.spare(k0, k1)
      if (!c) throw new Error(`no chunk canvas free for chunk ${k} with ${this.chunks.length} in the pool`)
      this.bake(level, c, k)
    }
    for (const k of [k1 + 1, k0 - 1]) {
      const c = wanted(k) ? this.spare(k0 - 1, k1 + 1) : null
      if (c) this.bake(level, c, k)
    }
  }

  /** A canvas holding no chunk from lo to hi: an empty one, else the one furthest away. */
  private spare(lo: number, hi: number): Chunk | null {
    let best: Chunk | null = null
    let far = -1
    for (const c of this.chunks) {
      if (c.k >= lo && c.k <= hi) continue
      const d = c.k < 0 ? Infinity : Math.min(Math.abs(c.k - lo), Math.abs(c.k - hi))
      if (d > far) {
        far = d
        best = c
      }
    }
    return best
  }

  /** Chunk k into canvas c: its columns in world units, with one more on each side so whatever overhangs into it shows. */
  private bake(level: Level, c: Chunk, k: number): void {
    const tile = this.view.tile
    const g = c.ctx
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.clearRect(0, 0, c.canvas.width, c.canvas.height)
    g.setTransform(tile, 0, 0, tile, -k * CHUNK * tile, 0)
    g.save()
    g.beginPath()
    g.rect(k * CHUNK, 0, CHUNK, ROWS)
    g.clip()
    drawTerrain(g, level, k * CHUNK - 1, k * CHUNK + CHUNK + 1)
    g.restore()
    c.k = k
  }
}
