import { BIRD_AFTER } from '../game/feed'
import type { Frame, Game } from '../game/game'
import {
  BALLOON_R,
  BAR_HALF,
  BASKET_Y,
  BREAD,
  COURSES,
  FEED_GROUND,
  FEED_H,
  FEED_W,
  FLY_HIGH,
  FROG_FOR,
  GATE_WARN,
  groundAt,
  HERO_HALF,
  HERO_R,
  HZ,
  INTRO_FOR,
  LIFT_FOR,
  MONSTER_OF,
  MONSTER_SPEED,
  MOUTH_Y,
  PICK_R,
  since,
  SOLID,
  STEP,
  type Course,
  type Feed,
  type FeedEvent,
  type Food,
  type Sim,
  type SimEvent,
} from '../game/model'
import { barsAt, FINISH_TIMES, sliderAt } from '../game/sim'
import { drawBalloon } from './balloon'
import { Effects } from './effects'
import { drawFood, drawGroundFood, drawPile, pileHeight } from './foods'
import { drawHero, plateAnchor, type HeroAct, type HeroPose } from './hero'
import { groundShadow, pen } from './look'
import { CART_SEAT, drawCart, drawMonster, MOUTH_UP, WHEEL_R, type MonsterPose } from './monster'
import { drawBackdrop, drawTrack } from './scene'
import { drawBar, drawBarShadow, drawBird, drawButton, drawDuck, drawFish, drawFlag, drawFrog, drawGateTile, drawGroove, drawPost, drawPuppy, drawSlider } from './things'
import { drawGround, drawSolid, drawWaterShine } from './world'

/** About this many tiles fit the screen's height on a course, and at least TILES_WIDE its width. */
const TILES_HIGH = 10.5
const TILES_WIDE = 15
/** The ground is baked into square chunks of this many tiles. */
const CHUNK = 8
/** How quickly the camera catches up (per second). */
const FOLLOW = 5
/** The balloon rises this many tiles as it lifts off the course. */
const RISE = 8
/** A fish leaps for a food that fell in for this long. */
const FISH_FOR = 0.9
/** The debug overlay's colours. */
const DEBUG = { hit: 'rgba(255, 0, 80, 0.8)', feet: 'rgba(0, 120, 255, 0.8)', grid: 'rgba(0, 0, 0, 0.12)', text: '#000', reach: 'rgba(255, 160, 0, 0.8)' } as const

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const smooth = (v: number) => {
  const k = clamp01(v)
  return k * k * (3 - 2 * k)
}

/** One thing to draw standing up, at its depth. */
interface Upright {
  y: number
  draw: () => void
}

/**
 * The renderer: the course seen from above at a slant (the ground baked into chunk canvases,
 * then everything standing sorted by its foot), the finale in side view, the party, the
 * particles, and the ?debug overlay. It reads the game and never changes the sims; it tells
 * the game where her feet and the finale's scene were drawn, so a finger can steer.
 */
export class Renderer {
  private effects = new Effects()
  private chunks = new Map<string, HTMLCanvasElement>()
  private bakedTile = 0
  private bakedCourse: Course | null = null
  private generation = -1
  private cam = { x: 0, y: 0, ready: false }
  private wobble = { lean: 0, v: 0 }
  private fish: { x: number; y: number; at: number }[] = []
  private ducks: { course: Course | null; spots: { x: number; y: number }[] } = { course: null, spots: [] }
  private width = 1
  private height = 1
  /** Device pixels per CSS pixel. */
  private dpr = 1
  private t = 0
  private fps = { frames: 0, since: 0, value: 0 }
  private readonly ctx: CanvasRenderingContext2D
  private readonly makeCanvas: () => HTMLCanvasElement
  /** ?debug: the grid, the hit lines and the frame rate over the picture. */
  private readonly debug: boolean

  constructor(ctx: CanvasRenderingContext2D, makeCanvas: () => HTMLCanvasElement, debug: boolean) {
    this.ctx = ctx
    this.makeCanvas = makeCanvas
    this.debug = debug
  }

  resize(width: number, height: number, dpr: number) {
    this.width = width
    this.height = height
    this.dpr = dpr
    this.invalidate()
  }

  /** Forgets every baked chunk (the size or the course changed). */
  invalidate() {
    this.chunks.clear()
  }

  dispose() {
    this.chunks.clear()
    this.effects.clear()
  }

  draw(game: Game, frame: Frame, seconds: number) {
    this.t += seconds
    if (game.generation !== this.generation) {
      this.generation = game.generation
      this.effects.clear()
      this.fish.length = 0
      this.cam.ready = false
      this.wobble = { lean: 0, v: 0 }
    }
    this.effects.step(seconds)
    const ctx = this.ctx
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    if (game.screen === 'feed' && game.feed) this.drawFeed(game, game.feed, frame)
    else if (game.screen === 'party') this.drawParty()
    else this.drawCourse(game, frame, seconds)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    if (this.debug) this.drawFps(seconds)
  }

  // ------------------------------------------------------------------------------------- the course

  private drawCourse(game: Game, frame: Frame, seconds: number) {
    const ctx = this.ctx
    const course = game.course
    const s = game.sim
    const tile = Math.max(8, Math.round(Math.min(this.height / TILES_HIGH, this.width / TILES_WIDE)))
    if (tile !== this.bakedTile || course !== this.bakedCourse) {
      this.chunks.clear()
      this.bakedTile = tile
      this.bakedCourse = course
    }
    const a = frame.alpha
    const h = s.hero
    const hx = h.px + (h.x - h.px) * a
    const hy = h.py + (h.y - h.py) * a
    const finishAge = s.phase === 'finish' || s.phase === 'done' ? since(s.phaseAt, s.tick) : -1
    const rise = finishAge >= FINISH_TIMES.liftoff ? smooth((finishAge - FINISH_TIMES.liftoff) / LIFT_FOR) * RISE : 0

    // The camera: on her while she plays, on the balloon as it lifts off, drifting over the course behind the cards and the kitchen.
    let tx: number
    let ty: number
    if (game.screen === 'play') {
      tx = finishAge >= FINISH_TIMES.climb ? course.balloon.x : hx
      ty = finishAge >= FINISH_TIMES.climb ? course.balloon.y - 1.5 - rise * 0.8 : hy - 0.9
    } else {
      tx = course.cols / 2 + (course.cols / 2 - 7) * Math.sin(this.t * 0.05)
      ty = course.rows / 2 + (course.rows / 2 - 4) * Math.sin(this.t * 0.07 + 1)
    }
    const viewW = this.width / tile
    const viewH = this.height / tile
    const clampTo = (v: number, size: number, view: number) => (size + 2 <= view ? size / 2 : Math.max(view / 2 - 1, Math.min(size + 1 - view / 2, v)))
    tx = clampTo(tx, course.cols, viewW)
    ty = game.screen === 'play' && rise > 0 ? ty : clampTo(ty, course.rows, viewH)
    if (!this.cam.ready) {
      this.cam = { x: tx, y: ty, ready: true }
    } else {
      const k = 1 - Math.exp(-seconds * FOLLOW)
      this.cam.x += (tx - this.cam.x) * k
      this.cam.y += (ty - this.cam.y) * k
    }
    const left = Math.round((this.cam.x - viewW / 2) * tile) / tile
    const top = Math.round((this.cam.y - viewH / 2) * tile) / tile

    // The ground, baked a chunk at a time.
    pen.px = tile
    const c0 = Math.floor(left / CHUNK)
    const c1 = Math.floor((left + viewW) / CHUNK)
    const r0 = Math.floor(top / CHUNK)
    const r1 = Math.floor((top + viewH) / CHUNK)
    for (let cy = r0; cy <= r1; cy++) {
      for (let cx = c0; cx <= c1; cx++) {
        const key = `${cx},${cy}`
        let chunk = this.chunks.get(key)
        if (!chunk) {
          chunk = this.bake(course, cx, cy, tile)
          this.chunks.set(key, chunk)
        }
        ctx.drawImage(chunk, Math.round((cx * CHUNK - left) * tile), Math.round((cy * CHUNK - top) * tile))
      }
    }

    ctx.setTransform(tile, 0, 0, tile, -left * tile, -top * tile)
    pen.px = tile
    const t = this.t
    const colFrom = Math.floor(left) - 1
    const colTo = Math.ceil(left + viewW) + 1
    const rowFrom = Math.floor(top) - 1
    const rowTo = Math.ceil(top + viewH) + 3

    // The water's ripples.
    for (let r = rowFrom; r <= rowTo; r++) {
      for (let c = colFrom; c <= colTo; c++) {
        if (groundAt(course, c, r) !== 'water') continue
        ctx.save()
        ctx.translate(c, r)
        drawWaterShine(ctx, course, c, r, t)
        ctx.restore()
      }
    }

    // What lies flat on the ground: grooves, the poles' shadows, buttons.
    for (const sl of course.sliders) {
      const mx = (sl.ax + sl.bx) / 2
      const my = (sl.ay + sl.by) / 2
      this.at(mx, my, () => drawGroove(ctx, sl.ax - mx, sl.ay - my, sl.bx - mx, sl.by - my))
    }
    const tick = s.tick + a
    const bars = barsAt(course, tick)
    for (const b of bars) this.at(0, 0, () => drawBarShadow(ctx, b.x0, b.y0, b.x1, b.y1))
    course.buttons.forEach((b, i) => {
      const st = s.buttons[i]!
      const down = st.down ? clamp01(since(st.at, s.tick) / 0.15) : st.at >= 0 ? 1 - clamp01(since(st.at, s.tick) / 0.15) : 0
      this.at(b.x, b.y, () => drawButton(ctx, b.hue, down, t))
    })

    // The particles and the fish the events set off.
    const pile = this.pileOf(s, finishAge)
    const top0 = 1.5 + pileHeight(pile)
    for (const e of frame.events) {
      if ('food' in e && e.kind === 'sink') this.fish.push({ x: e.x, y: e.y, at: this.t })
      if (e.kind === 'open') {
        course.gates.forEach((g) => {
          if (g.hue === e.hue) for (const tt of g.tiles) this.effects.gate(e.hue, tt.c + 0.5, tt.r + 1)
        })
      }
      if (e.kind === 'pick' || e.kind === 'bonk' || e.kind === 'land' || e.kind === 'sink' || e.kind === 'splash' || e.kind === 'back' || e.kind === 'press' || e.kind === 'zap' || e.kind === 'flag' || e.kind === 'puppy' || e.kind === 'finish' || e.kind === 'bread') {
        this.effects.course(e, hx, hy, top0)
      }
      if (e.kind === 'liftoff') this.effects.course(e, course.balloon.x, course.balloon.y + 0.5, top0)
    }
    this.fish = this.fish.filter((f) => this.t - f.at < FISH_FOR)

    // Everything standing, nearest last.
    const ups: Upright[] = []
    for (let r = rowFrom; r <= rowTo; r++) {
      for (let c = colFrom; c <= colTo; c++) {
        if (!SOLID[groundAt(course, c, r)]) continue
        ups.push({ y: r + 1, draw: () => this.at(c + 0.5, r + 1, () => drawSolid(ctx, course, c, r, t)) })
      }
    }
    course.gates.forEach((g, i) => {
      const st = s.gates[i]!
      const open = st.open ? smooth(since(st.at, s.tick) / 0.4) : st.at >= 0 ? 1 - smooth(since(st.at, s.tick) / 0.3) : 0
      const warn = st.open && st.until >= 0 && st.until - s.tick <= GATE_WARN * HZ
      g.tiles.forEach((tt, k) => {
        const part = g.tiles.length === 1 ? 'single' : k === 0 ? 'first' : k === g.tiles.length - 1 ? 'last' : 'middle'
        ups.push({ y: tt.r + 1, draw: () => this.at(tt.c + 0.5, tt.r + 1, () => drawGateTile(ctx, g.hue, g.along, part, open, warn, t)) })
      })
    })
    for (const sp of course.spinners) ups.push({ y: sp.y, draw: () => this.at(sp.x, sp.y, () => drawPost(ctx, course.id, t)) })
    // The spinners' arms (barsAt lists them first; the sliders' bars ride on their own wheels below).
    bars.slice(0, bars.length - course.sliders.length).forEach((b) => ups.push({ y: Math.max(b.y0, b.y1) + 0.01, draw: () => this.at(0, 0, () => drawBar(ctx, b.x0, b.y0, b.x1, b.y1, t)) }))
    // Sliders draw their own bar on wheels (barsAt's line is only for the shadow and the hits).
    for (const sl of course.sliders) {
      const at = sliderAt(sl, tick)
      const rolled = Math.hypot(at.x - sl.ax, at.y - sl.ay)
      const reach = Math.abs(Math.sin(sl.angle * Math.PI * 2)) * sl.half
      ups.push({ y: at.y + reach + 0.02, draw: () => this.at(at.x, at.y, () => drawSlider(ctx, sl.half, sl.angle, rolled, t)) })
    }
    course.flags.forEach((f, i) => {
      const at = s.flags[i]!.at
      ups.push({ y: f.y, draw: () => this.at(f.x, f.y, () => drawFlag(ctx, course.id, at >= 0, since(at, s.tick), t)) })
    })
    for (const it of s.items) {
      if (it.state === 'ground') {
        const phase = ((it.x * 0.37 + it.y * 0.61) % 1 + 1) % 1
        const bounce = it.at >= 0 ? Math.max(0, 1 - since(it.at, s.tick) / 0.3) : 0
        ups.push({
          y: it.y,
          draw: () =>
            this.at(it.x, it.y, () => {
              if (bounce > 0) ctx.scale(1 + bounce * 0.15, 1 - bounce * 0.15)
              drawGroundFood(ctx, it.kind, t, phase)
            }),
        })
      } else if (it.state === 'flying') {
        const k = clamp01((tick - it.at) / Math.max(1, it.lands - it.at))
        const gx = it.fx + (it.x - it.fx) * k
        const gy = it.fy + (it.y - it.fy) * k
        const lift = (1 - k) * top0 * 0.8 + FLY_HIGH * 4 * k * (1 - k)
        ups.push({
          y: gy,
          draw: () =>
            this.at(gx, gy, () => {
              groundShadow(ctx, 0.3 * (1 - clamp01(lift / 4) * 0.5))
              ctx.translate(0, -lift)
              ctx.rotate(k * 5)
              ctx.scale(0.75, 0.75)
              drawFood(ctx, it.kind, t)
            }),
        })
      }
    }
    for (const p of s.puppies) {
      const flip = p.face === 'left' ? -1 : 1
      const face = p.face === 'left' || p.face === 'right' ? 'side' : p.face
      ups.push({
        y: p.y,
        draw: () =>
          this.at(p.x, p.y, () => {
            groundShadow(ctx, 0.3)
            ctx.scale(flip, 1)
            drawPuppy(ctx, face, p.walked, t)
          }),
      })
    }
    for (const f of this.fish) ups.push({ y: f.y, draw: () => this.at(f.x, f.y, () => drawFish(ctx, this.t - f.at)) })
    this.ducksOf(course).forEach((d, i) => {
      const a0 = t * 0.25 + i * 2.1
      const x = d.x + Math.cos(a0) * 0.7
      const y = d.y + Math.sin(a0) * 0.35
      const flip = -Math.sin(a0) < 0 ? -1 : 1
      ups.push({
        y,
        draw: () =>
          this.at(x, y, () => {
            ctx.scale(flip, 1)
            drawDuck(ctx, t, i * 0.37)
          }),
      })
    })

    // The balloon, waiting at the end, then lifting off with her in it.
    const climbed = finishAge >= FINISH_TIMES.climb
    const bx = course.balloon.x
    const by = course.balloon.y + 0.5
    ups.push({
      y: by,
      draw: () =>
        this.at(bx, by, () => {
          groundShadow(ctx, 1.4 * (1 - clamp01(rise / RISE) * 0.6))
          ctx.translate(0, -rise)
          drawBalloon(ctx, { t, slot: 0, pegs: rise === 0 }, climbed ? (c) => drawHero(c, { face: 'down', act: 'ride', stride: 0, since: finishAge - FINISH_TIMES.climb, t }) : null)
        }),
    })

    // Her, unless she is in the basket.
    if (!climbed) {
      const sinceAct = since(h.actAt, s.tick)
      if (h.act === 'frog') {
        const home = s.flag >= 0 ? course.flags[s.flag]! : course.start
        const k = clamp01(sinceAct / FROG_FOR)
        const fx = h.x + (home.x - h.x) * smooth(k)
        const fy = h.y + (home.y - h.y) * smooth(k)
        const hop = Math.abs(Math.sin(k * Math.PI * 3)) * 0.9
        const flip = home.x < h.x ? -1 : 1
        ups.push({
          y: fy,
          draw: () =>
            this.at(fx, fy, () => {
              groundShadow(ctx, 0.5)
              ctx.translate(0, -hop)
              ctx.scale(flip, 1)
              drawFrog(ctx, true, sinceAct, t)
            }),
        })
      } else {
        const pose = this.poseOf(s, finishAge, t)
        const flip = h.face === 'left' ? -1 : 1
        const blink = h.act === 'walk' && s.tick < h.safeUntil && Math.floor(t * 8) % 2 === 0
        this.lean(h.vx, seconds)
        ups.push({
          y: hy,
          draw: () =>
            this.at(hx, hy, () => {
              if (blink) ctx.globalAlpha = 0.5
              if (h.act !== 'swim') groundShadow(ctx, 0.34)
              ctx.save()
              ctx.scale(flip, 1)
              drawHero(ctx, pose)
              ctx.restore()
              const anchor = plateAnchor(pose)
              ctx.translate(anchor.x * flip, anchor.y)
              drawPile(ctx, pile, this.wobble.lean, t)
            }),
        })
      }
    }

    ups.sort((p, q) => p.y - q.y)
    for (const u of ups) u.draw()
    this.effects.draw(ctx, t)
    if (this.debug) this.drawDebug(course, s, hx, hy, rowFrom, rowTo, colFrom, colTo)

    const ss = game.screenspace
    ss.heroX = (hx - left) * (tile / this.dpr)
    ss.heroY = (hy - top) * (tile / this.dpr)
    ss.tile = tile / this.dpr
  }

  /** Runs `draw` with the origin at (x, y), then puts the context back. */
  private at(x: number, y: number, draw: () => void) {
    const ctx = this.ctx
    ctx.save()
    ctx.translate(x, y)
    draw()
    ctx.restore()
  }

  /** The chunk (cx, cy) of the course's ground, baked at `tile` device pixels a tile. */
  private bake(course: Course, cx: number, cy: number, tile: number): HTMLCanvasElement {
    const canvas = this.makeCanvas()
    canvas.width = CHUNK * tile
    canvas.height = CHUNK * tile
    const c = canvas.getContext('2d')!
    pen.px = tile
    c.setTransform(tile, 0, 0, tile, 0, 0)
    for (let r = 0; r < CHUNK; r++) {
      for (let k = 0; k < CHUNK; k++) {
        c.save()
        c.translate(k, r)
        drawGround(c, course, cx * CHUNK + k, cy * CHUNK + r)
        c.restore()
      }
    }
    return canvas
  }

  /** What is on her plate as drawn: the pile, and from the bread on her whole dish. */
  private pileOf(s: Sim, finishAge: number): Food[] {
    if (finishAge >= FINISH_TIMES.bread) return [BREAD[s.dish].bottom, ...s.plate, BREAD[s.dish].top]
    return s.plate
  }

  private poseOf(s: Sim, finishAge: number, t: number): HeroPose {
    const h = s.hero
    const moving = Math.hypot(h.x - h.px, h.y - h.py) > 0.2 * STEP
    let act: HeroAct
    switch (h.act) {
      case 'walk':
        act = moving ? 'walk' : 'stand'
        break
      case 'finish':
        act = finishAge >= FINISH_TIMES.bread ? 'cheer' : moving ? 'walk' : 'stand'
        break
      case 'teeter':
      case 'bonk':
      case 'zap':
      case 'swim':
        act = h.act
        break
      case 'frog':
        act = 'swim'
        break
    }
    const face = h.face === 'left' || h.face === 'right' ? 'side' : h.face
    const from = h.act === 'finish' && finishAge >= FINISH_TIMES.bread ? FINISH_TIMES.bread : 0
    return { face, act, stride: h.walked, since: h.act === 'finish' ? finishAge - from : since(h.actAt, s.tick), t }
  }

  /** The pile leans back as she walks and wobbles when she starts and stops: a damped spring. */
  private lean(vx: number, seconds: number) {
    const w = this.wobble
    const target = -vx * 0.045
    const dt = Math.min(seconds, 0.05)
    w.v += (-(w.lean - target) * 60 - w.v * 6) * dt
    w.lean = Math.max(-0.45, Math.min(0.45, w.lean + w.v * dt))
  }

  /** A few ducks on open water near the land, the same every visit to a course. */
  private ducksOf(course: Course) {
    if (this.ducks.course === course) return this.ducks.spots
    const spots: { x: number; y: number }[] = []
    for (let r = 1; r < course.rows - 1 && spots.length < 4; r += 3) {
      for (let c = 1; c < course.cols - 1 && spots.length < 4; c += 5) {
        if ((c * 7 + r * 13) % 5 !== 0) continue
        let water = 0
        let land = false
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const g = groundAt(course, c + dc, r + dr)
            if (g === 'water') water++
            else land = true
          }
        }
        if (water >= 22 && land && spots.every((p) => Math.hypot(p.x - c, p.y - r) > 6)) spots.push({ x: c + 0.5, y: r + 0.5 })
      }
    }
    this.ducks = { course, spots }
    return spots
  }

  private drawDebug(course: Course, s: Sim, hx: number, hy: number, r0: number, r1: number, c0: number, c1: number) {
    const ctx = this.ctx
    ctx.save()
    ctx.lineWidth = 1 / pen.px
    ctx.strokeStyle = DEBUG.grid
    for (let r = r0; r <= r1; r++) {
      ctx.beginPath()
      ctx.moveTo(c0, r)
      ctx.lineTo(c1, r)
      ctx.stroke()
    }
    for (let c = c0; c <= c1; c++) {
      ctx.beginPath()
      ctx.moveTo(c, r0)
      ctx.lineTo(c, r1)
      ctx.stroke()
    }
    ctx.lineWidth = 2 / pen.px
    ctx.strokeStyle = DEBUG.feet
    ctx.strokeRect(hx - HERO_HALF, hy - HERO_HALF, HERO_HALF * 2, HERO_HALF * 2)
    ctx.beginPath()
    ctx.arc(hx, hy, PICK_R, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeStyle = DEBUG.hit
    ctx.beginPath()
    ctx.arc(hx, hy, HERO_R, 0, Math.PI * 2)
    ctx.stroke()
    for (const b of barsAt(course, s.tick)) {
      ctx.lineWidth = BAR_HALF * 2
      ctx.beginPath()
      ctx.moveTo(b.x0, b.y0)
      ctx.lineTo(b.x1, b.y1)
      ctx.stroke()
    }
    ctx.lineWidth = 2 / pen.px
    ctx.strokeStyle = DEBUG.reach
    ctx.beginPath()
    ctx.arc(course.balloon.x, course.balloon.y, BALLOON_R, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }

  private drawFps(seconds: number) {
    const f = this.fps
    f.frames += 1
    f.since += seconds
    if (f.since >= 0.5) {
      f.value = f.frames / f.since
      f.frames = 0
      f.since = 0
    }
    const ctx = this.ctx
    ctx.font = `${Math.round(14 * this.dpr)}px system-ui`
    ctx.fillStyle = DEBUG.text
    ctx.fillText(`${f.value.toFixed(0)} fps`, 8 * this.dpr, this.height - 10 * this.dpr)
  }

  // ------------------------------------------------------------------------------------- the finale

  /** Fits the finale's scene into the screen: its scale (device px a tile) and where its corner lands. */
  private fitScene() {
    const scale = Math.min(this.width / FEED_W, this.height / FEED_H)
    const ox = (this.width - FEED_W * scale) / 2
    const oy = (this.height - FEED_H * scale) / 2
    return { scale, ox, oy, x0: -ox / scale, x1: (this.width - ox) / scale, y0: -oy / scale, y1: (this.height - oy) / scale }
  }

  private drawFeed(game: Game, f: Feed, frame: Frame) {
    const ctx = this.ctx
    const fit = this.fitScene()
    ctx.setTransform(fit.scale, 0, 0, fit.scale, fit.ox, fit.oy)
    pen.px = fit.scale
    const t = this.t
    const a = frame.alpha
    const id = MONSTER_OF[f.course]
    const m = f.monster
    const mx = m.px + (m.x - m.px) * a
    const bx = f.balloon.px + (f.balloon.x - f.balloon.px) * a

    for (const e of frame.events) if (isFeedEvent(e)) this.effects.feed(e, MOUTH_Y, mx)

    drawBackdrop(ctx, f.course, fit.x0, fit.x1, fit.y0, fit.y1, t)
    drawTrack(ctx, f.course, fit.x0, fit.x1, t)

    // Where each falling layer will come down: a shadow on the track, darker as it nears.
    for (const it of f.falling) {
      if (it.state !== 'fall') continue
      const k = clamp01((it.y - BASKET_Y) / (MOUTH_Y - BASKET_Y))
      this.at(it.x, FEED_GROUND, () => groundShadow(ctx, 0.35 + 0.25 * k, 0.12 + 0.06 * k))
    }

    // Layers that missed lie on the grass until a bird takes them away.
    for (const it of f.falling) {
      if (it.state !== 'missed') continue
      const age = since(it.endAt, f.tick) - BIRD_AFTER
      const side = it.x > FEED_W / 2 ? 1 : -1
      if (age < 0.7 + 0.8) {
        this.at(it.x, FEED_GROUND - 0.02, () => {
          ctx.scale(0.8, 0.8)
          drawFood(ctx, it.kind, t)
        })
      }
      if (age < 0) continue
      let x: number
      let y: number
      let act: 'fly' | 'hop' | 'peck'
      if (age < 0.7) {
        const k = smooth(age / 0.7)
        x = it.x + side * (5 * (1 - k) + 0.45)
        y = FEED_GROUND - 4 * (1 - k)
        act = 'fly'
      } else if (age < 1.5) {
        x = it.x + side * 0.45
        y = FEED_GROUND
        act = 'peck'
      } else if (age < 2.6) {
        const k = (age - 1.5) / 1.1
        x = it.x + side * (0.45 + 6 * k)
        y = FEED_GROUND - 5 * k
        act = 'fly'
      } else continue
      this.at(x, y, () => {
        ctx.scale(-side, 1)
        drawBird(ctx, act, age, t)
        if (age >= 1.5) {
          ctx.translate(0.35, -0.25)
          ctx.scale(0.4, 0.4)
          drawFood(ctx, it.kind, t)
        }
      })
    }

    // The monster on its cart.
    const pose = this.monsterPose(f, mx, t)
    const seat = MOUTH_Y + MOUTH_UP[id]
    // The wheels roll without slipping: a turn for every 2 pi of their radius travelled.
    this.at(mx, FEED_GROUND, () => drawCart(ctx, mx / WHEEL_R, t))
    this.at(mx, Math.min(seat, FEED_GROUND - CART_SEAT), () => drawMonster(ctx, id, pose))

    // Falling layers, and a poop spat out flying off.
    for (const it of f.falling) {
      if (it.state === 'fall') {
        const x = it.px + (it.x - it.px) * a
        const y = it.py + (it.y - it.py) * a
        this.at(x, y, () => {
          ctx.rotate(Math.sin(since(it.at, f.tick) * 5) * 0.2)
          drawFood(ctx, it.kind, t)
        })
      } else if (it.state === 'spat') {
        const k = since(it.endAt, f.tick)
        if (k > 1.4) continue
        const side = it.x > FEED_W / 2 ? -1 : 1
        this.at(it.x + side * 4 * k, MOUTH_Y - 3 * k + 5 * k * k, () => {
          ctx.globalAlpha = clamp01(1.4 - k)
          ctx.rotate(k * 8 * side)
          drawFood(ctx, it.kind, t)
        })
      } else if (it.state === 'eaten') {
        const k = since(it.endAt, f.tick)
        if (k > 0.12) continue
        this.at(it.x, MOUTH_Y + k * 2, () => {
          ctx.scale(1 - k * 6, 1 - k * 6)
          drawFood(ctx, it.kind, t)
        })
      }
    }

    // The balloon over it all, her waving from the basket, the slot open as a layer drops.
    const intro = f.phase === 'intro' ? 1 - smooth(since(f.phaseAt, f.tick) / INTRO_FOR) : 0
    const lastDrop = f.falling.length > 0 ? f.falling[f.falling.length - 1]!.at : -1
    const slot = lastDrop >= 0 ? clamp01(1 - Math.abs(since(lastDrop, f.tick) - 0.05) / 0.3) : 0
    if (Math.floor(t * 2.5) !== Math.floor((t - 1 / 60) * 2.5)) this.effects.burner(bx, BASKET_Y - 1.4 - intro * 7)
    this.at(bx, BASKET_Y - intro * 7, () => drawBalloon(ctx, { t, slot, pegs: false }, (c) => drawHero(c, { face: 'down', act: 'ride', stride: 0, since: t, t })))

    this.effects.draw(ctx, t)
    const ss = game.screenspace
    ss.feedLeft = fit.ox / this.dpr
    ss.feedTop = fit.oy / this.dpr
    ss.feedScale = fit.scale / this.dpr
  }

  private monsterPose(f: Feed, mx: number, t: number): MonsterPose {
    const m = f.monster
    let near: Feed['falling'][number] | null = null
    for (const it of f.falling) if (it.state === 'fall' && (near === null || it.y > near.y)) near = it
    const belly = clamp01((f.eaten + f.breads) / Math.max(1, f.total + 2))
    const lean = Math.max(-1, Math.min(1, m.vx / MONSTER_SPEED))
    const look = near ? Math.max(-1, Math.min(1, (near.x - mx) / 3)) : 0
    const base = { belly, lean, look, t }
    if (f.phase === 'eat') return { ...base, mood: 'dance', mouth: 0, since: since(f.phaseAt, f.tick) }
    if (f.phase === 'done') return { ...base, mood: 'happy', mouth: 0, since: since(f.phaseAt, f.tick) }
    if (since(m.blehAt, f.tick) < 0.8) return { ...base, mood: 'yuck', mouth: 0.3, since: since(m.blehAt, f.tick) }
    if (since(m.chewAt, f.tick) < 0.5) return { ...base, mood: 'chew', mouth: 0, since: since(m.chewAt, f.tick) }
    let mouth = 0.2
    if (near && near.kind !== 'poop' && Math.abs(near.x - mx) < 3) mouth = Math.max(0.2, Math.min(1, 1.25 - (MOUTH_Y - near.y) / 2.5))
    return { ...base, mood: 'hungry', mouth, since: t }
  }

  // ------------------------------------------------------------------------------------- the party

  private drawParty() {
    const ctx = this.ctx
    const fit = this.fitScene()
    ctx.setTransform(fit.scale, 0, 0, fit.scale, fit.ox, fit.oy)
    pen.px = fit.scale
    const t = this.t
    drawBackdrop(ctx, 'castle', fit.x0, fit.x1, fit.y0, fit.y1, t)
    drawTrack(ctx, 'castle', fit.x0, fit.x1, t)
    COURSES.forEach((id, i) => {
      const x = 2.4 + i * 2.8
      this.at(x, FEED_GROUND - 0.02, () => {
        groundShadow(ctx, 0.9)
        drawMonster(ctx, MONSTER_OF[id], { mouth: 0, belly: 1, mood: 'dance', since: t + i * 0.13, lean: Math.sin(t * 3 + i) * 0.5, look: 0, t: t + i })
      })
    })
    if (Math.floor(t) !== Math.floor(t - 1 / 60)) this.effects.feed({ kind: 'full' }, 4, 2 + ((Math.floor(t) * 5) % 12))
    this.effects.draw(ctx, t)
  }
}

const FEED_KINDS = new Set<string>(['drop', 'chomp', 'bleh', 'miss', 'bird', 'full', 'burp', 'stars'])
/** The frame's events in the finale are its own (the last course step's may come with them). */
function isFeedEvent(e: SimEvent | FeedEvent): e is FeedEvent {
  return FEED_KINDS.has(e.kind)
}
