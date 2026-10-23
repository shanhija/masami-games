/**
 * The offscreen canvases the renderer paints once and draws many times (the land, the
 * layout's belts and buildings, the items' stamps). One budget of pixels for them all, the
 * least recently used let go first. A canvas let go is shrunk to nothing (width and height
 * 0), which frees its memory at once (iOS Safari otherwise keeps it until a collection), and
 * kept for reuse, unless its context is lost: a lost context paints nothing, so its canvas
 * is never reused.
 */

/** All offscreen canvases together stay under this many pixels: about 96 MB, a fair share of what an iPad gives one tab's canvases. */
export const BUDGET = 24e6
/** At most this many shrunk canvases wait for reuse. */
const SPARE = 8

/** Whether a context is lost (a browser without isContextLost never says so). */
const lost = (ctx: CanvasRenderingContext2D) => ctx.isContextLost?.() === true

interface Entry {
  group: string
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  pixels: number
  /** The frame it was last used in: the canvases this frame draws from are never let go during it. */
  frame: number
}

export class Cache {
  /** In use order, least recent first (a Map keeps insertion order; a use moves an entry to the end). */
  private entries = new Map<string, Entry>()
  private spare: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }[] = []
  private frame = 0
  /** Pixels held now, and how many paints there have been (the ?debug overlay shows both). */
  pixels = 0
  painted = 0

  constructor(
    private make: () => HTMLCanvasElement,
    private budget: number,
  ) {}

  /** A new frame begins. */
  tick(): void {
    this.frame++
  }

  get count(): number {
    return this.entries.size
  }

  /** The canvas held under `key`, marked used, or null. */
  find(key: string): HTMLCanvasElement | null {
    const e = this.entries.get(key)
    if (!e) return null
    this.touch(key, e)
    return e.canvas
  }

  /** The held keys of a group, least recently used first. */
  keys(group: string): string[] {
    const out: string[] = []
    for (const [key, e] of this.entries) if (e.group === group) out.push(key)
    return out
  }

  /**
   * The canvas under `key`, `w` x `h` device pixels: the one held, or a new one painted by
   * `paint` (which gets its context cleared, at the identity transform, and must leave it
   * balanced). Making room lets go of the least recently used canvases first, never one
   * this frame already drew from; a frame that needs more than the budget gets it.
   */
  get(key: string, group: string, w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
    const held = this.entries.get(key)
    if (held) {
      this.touch(key, held)
      return held.canvas
    }
    const width = Math.max(1, Math.ceil(w))
    const height = Math.max(1, Math.ceil(h))
    const pixels = width * height
    for (const [k, e] of this.entries) {
      if (this.pixels + pixels <= this.budget) break
      if (e.frame !== this.frame) this.release(k)
    }
    let fresh = this.spare.pop()
    while (fresh && lost(fresh.ctx)) fresh = this.spare.pop()
    fresh ??= this.fresh()
    fresh.canvas.width = width
    fresh.canvas.height = height
    const e: Entry = { group, canvas: fresh.canvas, ctx: fresh.ctx, pixels, frame: this.frame }
    this.entries.set(key, e)
    this.pixels += pixels
    e.ctx.setTransform(1, 0, 0, 1, 0, 0)
    e.ctx.clearRect(0, 0, width, height)
    paint(e.ctx)
    e.ctx.setTransform(1, 0, 0, 1, 0, 0)
    this.painted++
    return e.canvas
  }

  /** The context of the canvas held under `key` (for a canvas repainted every frame). */
  context(key: string): CanvasRenderingContext2D {
    const e = this.entries.get(key)
    if (!e) throw new Error(`no canvas held under ${key}`)
    return e.ctx
  }

  /** Lets go of every canvas of `group` whose key `keep` turns down. */
  drop(group: string, keep: (key: string) => boolean): void {
    for (const [k, e] of this.entries) if (e.group === group && !keep(k)) this.release(k)
  }

  /** Lets go of everything, the spares too: after a lost context (the bakes are stale, and the spares' contexts may be lost with it) or with the stage gone. */
  clear(): void {
    for (const k of [...this.entries.keys()]) this.release(k)
    for (const s of this.spare) s.canvas.width = s.canvas.height = 0
    this.spare = []
  }

  private touch(key: string, e: Entry) {
    e.frame = this.frame
    this.entries.delete(key)
    this.entries.set(key, e)
  }

  private release(key: string) {
    const e = this.entries.get(key)!
    this.entries.delete(key)
    this.pixels -= e.pixels
    e.canvas.width = e.canvas.height = 0
    if (this.spare.length < SPARE && !lost(e.ctx)) this.spare.push({ canvas: e.canvas, ctx: e.ctx })
  }

  private fresh() {
    const canvas = this.make()
    return { canvas, ctx: canvas.getContext('2d')! }
  }
}
