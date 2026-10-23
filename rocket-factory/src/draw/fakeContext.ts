/**
 * A 2D context that draws nothing and checks everything, for the draw tests: art written
 * without looking must not crash, draw NaN, use a negative radius, leave the context changed,
 * or reach for an API that does not work everywhere (Safari has no ctx.filter, node has no
 * Path2D, ctx.roundRect and ctx.reset are too new). It does not judge looks; the sprite
 * sheets (?sheet) and screenshots do that. The small helpers every draw test shares sit at
 * its foot: where a drawing pokes out of its room, the colours it uses, its calls, the pen.
 */
import { expect } from 'vitest'

import type { Box } from '../game/where'
import { SHADOW, pen } from './look'

type Matrix = [number, number, number, number, number, number]
const multiply = (m: Matrix, a: number, b: number, c: number, d: number, e: number, f: number): Matrix => [
  m[0] * a + m[2] * b,
  m[1] * a + m[3] * b,
  m[0] * c + m[2] * d,
  m[1] * c + m[3] * d,
  m[0] * e + m[2] * f + m[4],
  m[1] * e + m[3] * f + m[5],
]

/** Methods whose every argument must be a finite number, and which of their arguments are radii (a negative radius throws in a browser). */
const GEOMETRY: Record<string, number[]> = {
  moveTo: [],
  lineTo: [],
  arc: [2],
  arcTo: [4],
  ellipse: [2, 3],
  quadraticCurveTo: [],
  bezierCurveTo: [],
  rect: [],
  fillRect: [],
  strokeRect: [],
  clearRect: [],
}

/** Properties that do not work everywhere this game runs. */
const BANNED = new Set(['filter', 'shadowBlur', 'shadowColor', 'letterSpacing', 'wordSpacing'])

/** The angles in a canvas arc's sweep from a0 to a1 (the canvas goes the long way round when told to): the start, the end, and every angle in `extremes` (and its turns) that falls inside. */
function sweptAngles(a0: number, a1: number, ccw: boolean, extremes: readonly number[]): number[] {
  const TURN = Math.PI * 2
  let sweep = ccw ? a0 - a1 : a1 - a0
  sweep = sweep >= TURN ? TURN : ((sweep % TURN) + TURN) % TURN
  const dir = ccw ? -1 : 1
  const out = [a0, a0 + dir * sweep]
  for (const e of extremes) {
    // How far along the sweep e lies, in the sweep's own direction.
    const along = (((dir * (e - a0)) % TURN) + TURN) % TURN
    if (along <= sweep) out.push(a0 + dir * along)
  }
  return out
}

/** The points each straight or curved call reaches, in its own coordinates (control points count, so a curve's box is never too small). Arcs and ellipses are measured exactly in `track`. */
function reach(name: string, a: readonly number[]): number[] {
  switch (name) {
    case 'moveTo':
    case 'lineTo':
      return [a[0]!, a[1]!]
    case 'quadraticCurveTo':
      return a.slice(0, 4)
    case 'bezierCurveTo':
      return a.slice(0, 6)
    case 'arcTo':
      return a.slice(0, 4)
    case 'rect':
    case 'fillRect':
    case 'strokeRect':
      return [a[0]!, a[1]!, a[0]! + a[2]!, a[1]!, a[0]!, a[1]! + a[3]!, a[0]! + a[2]!, a[1]! + a[3]!]
    default:
      return []
  }
}

export function fakeContext() {
  const state = {
    m: [1, 0, 0, 1, 0, 0] as Matrix,
    alpha: 1,
    stack: [] as { m: Matrix; alpha: number }[],
    counts: {} as Record<string, number>,
    /** While measuring: the inverse of the transform when measuring began, and the box so far in those coordinates. */
    measuring: null as null | { inv: Matrix; box: { x0: number; y0: number; x1: number; y1: number } },
  }
  const count = (name: string) => (state.counts[name] = (state.counts[name] ?? 0) + 1)
  const finite = (name: string, args: unknown[]) => {
    args.forEach((a, i) => {
      if (typeof a === 'number' && !Number.isFinite(a)) throw new Error(`${name} argument ${i} is ${a}`)
    })
  }
  /** Grows the measured box by everything a geometry call reaches, in the coordinates of the transform when measuring began. */
  const track = (name: string, args: unknown[]) => {
    const mm = state.measuring
    if (!mm || !(name in GEOMETRY) || name === 'clearRect') return
    const a = args as number[]
    // From the call's own coordinates to the measured ones: the start's inverse after the current transform.
    const m = state.m
    const i = mm.inv
    const t: Matrix = [
      i[0] * m[0] + i[2] * m[1],
      i[1] * m[0] + i[3] * m[1],
      i[0] * m[2] + i[2] * m[3],
      i[1] * m[2] + i[3] * m[3],
      i[0] * m[4] + i[2] * m[5] + i[4],
      i[1] * m[4] + i[3] * m[5] + i[5],
    ]
    const add = (lx: number, ly: number) => {
      const x = t[0] * lx + t[2] * ly + t[4]
      const y = t[1] * lx + t[3] * ly + t[5]
      mm.box.x0 = Math.min(mm.box.x0, x)
      mm.box.y0 = Math.min(mm.box.y0, y)
      mm.box.x1 = Math.max(mm.box.x1, x)
      mm.box.y1 = Math.max(mm.box.y1, y)
    }
    if (name === 'arc' || name === 'ellipse') {
      // An ellipse arc is c + R(rot) (rx cos q, ry sin q); through t each measured coordinate is X + P cos q + Q sin q, extreme where q = atan2(Q, P) (and half a turn on).
      const [cx, cy, rx, ry, rot, a0, a1, ccw] = name === 'arc' ? [a[0]!, a[1]!, a[2]!, a[2]!, 0, a[3]!, a[4]!, args[5] === true] : [a[0]!, a[1]!, a[2]!, a[3]!, a[4]!, a[5]!, a[6]!, args[7] === true]
      const c = Math.cos(rot)
      const sn = Math.sin(rot)
      const px = (t[0] * c + t[2] * sn) * rx
      const qx = (-t[0] * sn + t[2] * c) * ry
      const py = (t[1] * c + t[3] * sn) * rx
      const qy = (-t[1] * sn + t[3] * c) * ry
      const ex = Math.atan2(qx, px)
      const ey = Math.atan2(qy, py)
      for (const q of sweptAngles(a0, a1, ccw, [ex, ex + Math.PI, ey, ey + Math.PI])) {
        const lx = rx * Math.cos(q)
        const ly = ry * Math.sin(q)
        add(cx + lx * c - ly * sn, cy + lx * sn + ly * c)
      }
      return
    }
    const pts = reach(name, a)
    for (let k = 0; k < pts.length; k += 2) add(pts[k]!, pts[k + 1]!)
  }
  const methods: Record<string, (...args: never[]) => unknown> = {
    save: () => state.stack.push({ m: [...state.m], alpha: state.alpha }),
    restore: () => {
      const top = state.stack.pop()
      if (!top) throw new Error('restore without a save')
      state.m = top.m
      state.alpha = top.alpha
    },
    translate: (x: number, y: number) => (state.m = multiply(state.m, 1, 0, 0, 1, x, y)),
    scale: (x: number, y: number) => (state.m = multiply(state.m, x, 0, 0, y, 0, 0)),
    rotate: (a: number) => (state.m = multiply(state.m, Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0)),
    transform: (a: number, b: number, c: number, d: number, e: number, f: number) => (state.m = multiply(state.m, a, b, c, d, e, f)),
    setTransform: (a: number, b: number, c: number, d: number, e: number, f: number) => (state.m = [a, b, c, d, e, f]),
    resetTransform: () => (state.m = [1, 0, 0, 1, 0, 0]),
    getTransform: () => ({ a: state.m[0], b: state.m[1], c: state.m[2], d: state.m[3], e: state.m[4], f: state.m[5] }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    createPattern: () => ({ setTransform: () => {} }),
    measureText: () => ({ width: 1, actualBoundingBoxAscent: 1, actualBoundingBoxDescent: 0 }),
    getLineDash: () => [],
    isPointInPath: () => false,
    drawImage: () => {},
    roundRect: () => {
      throw new Error('ctx.roundRect: use roundRectPath from look.ts')
    },
    createConicGradient: () => {
      throw new Error('ctx.createConicGradient does not work everywhere')
    },
    reset: () => {
      throw new Error('ctx.reset does not work everywhere')
    },
  }
  const props: Record<string, unknown> = {
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    font: '10px sans-serif',
    lineJoin: 'miter',
    lineCap: 'butt',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    globalCompositeOperation: 'source-over',
    lineDashOffset: 0,
    miterLimit: 10,
    imageSmoothingEnabled: true,
    canvas: { width: 1600, height: 1000 },
  }
  const ctx = new Proxy(props, {
    get(target, key: string) {
      if (key === 'globalAlpha') return state.alpha
      if (key in methods) {
        return (...args: never[]) => {
          count(key)
          finite(key, args)
          return methods[key]!(...args)
        }
      }
      if (key in target) return target[key]
      return (...args: unknown[]) => {
        count(key)
        finite(key, args)
        for (const r of GEOMETRY[key] ?? []) if ((args[r] as number) < 0) throw new Error(`${key} with a negative radius ${String(args[r])}`)
        track(key, args)
      }
    },
    set(target, key: string, value) {
      if (BANNED.has(key)) throw new Error(`ctx.${key} does not work everywhere`)
      if (key === 'globalAlpha') {
        if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`globalAlpha ${value}`)
        state.alpha = value
        return true
      }
      if (key === 'lineWidth' && !(Number.isFinite(value) && value > 0)) throw new Error(`lineWidth ${value}`)
      target[key] = value
      return true
    },
  }) as unknown as CanvasRenderingContext2D

  /** Runs one draw and checks it left the context as it found it; `text: 'none'` also checks it drew no text and made no gradient or pattern. */
  const check = (what: string, draw: () => void, text: 'none' | 'allowed') => {
    const before = {
      m: [...state.m],
      alpha: state.alpha,
      depth: state.stack.length,
      text: (state.counts.fillText ?? 0) + (state.counts.strokeText ?? 0),
      gradients: (state.counts.createLinearGradient ?? 0) + (state.counts.createRadialGradient ?? 0) + (state.counts.createPattern ?? 0),
    }
    try {
      draw()
    } catch (e) {
      throw new Error(`${what}: ${(e as Error).message}`)
    }
    expect(state.stack.length, `${what}: save and restore balance`).toBe(before.depth)
    expect(state.m, `${what}: the transform comes back`).toEqual(before.m)
    expect(state.alpha, `${what}: globalAlpha comes back`).toBe(before.alpha)
    if (text === 'none') {
      expect((state.counts.fillText ?? 0) + (state.counts.strokeText ?? 0), `${what}: no text`).toBe(before.text)
      expect(
        (state.counts.createLinearGradient ?? 0) + (state.counts.createRadialGradient ?? 0) + (state.counts.createPattern ?? 0),
        `${what}: no gradient or pattern per call`,
      ).toBe(before.gradients)
    }
  }
  /**
   * The box everything `draw` reaches, in the coordinates of the transform when it is
   * called (path points and their control points, circles and rects whole; line widths not
   * counted). An empty drawing gives an inverted box (x0 > x1).
   */
  const measure = (draw: () => void) => {
    const [a, b, c, d, e, f] = state.m
    const det = a * d - b * c
    const inv: Matrix = [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det]
    state.measuring = { inv, box: { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity } }
    try {
      draw()
      return state.measuring.box
    } finally {
      state.measuring = null
    }
  }
  return { ctx, check, measure, counts: state.counts }
}

/** The calls that add to a path or paint a rect: what a clip hides. */
const PATH_CALLS = new Set(['moveTo', 'lineTo', 'arc', 'arcTo', 'ellipse', 'quadraticCurveTo', 'bezierCurveTo', 'rect', 'fillRect', 'strokeRect'])

/**
 * The context seen through the clips a drawing sets: under a clip, path calls do not reach
 * it, so a measure counts the clip's own path and not the paint the canvas cuts away.
 */
export function clipped(ctx: CanvasRenderingContext2D): CanvasRenderingContext2D {
  let depth = 0
  let clipAt = Infinity
  return new Proxy(ctx, {
    get(target, key: string) {
      const v = Reflect.get(target, key) as unknown
      if (typeof v !== 'function') return v
      return (...args: unknown[]) => {
        if (key === 'save') depth++
        if (key === 'restore' && --depth < clipAt) clipAt = Infinity
        if (key === 'clip') clipAt = Math.min(clipAt, depth)
        if (depth >= clipAt && PATH_CALLS.has(key)) return undefined
        return (v as (...a: unknown[]) => unknown)(...args)
      }
    },
    set: (target, key, value) => Reflect.set(target, key, value),
  })
}

// ---------------------------------------------------------------------------------------
// The draw tests' shared helpers

/** A box by its edges: what `measure` gives, and the room a drawing may take. */
export interface Edges {
  x0: number
  y0: number
  x1: number
  y1: number
}
/** A box's edges, grown by `margin` all round. */
export const edges = (b: Box, margin: number): Edges => ({ x0: b.x - margin, y0: b.y - margin, x1: b.x + b.w + margin, y1: b.y + b.h + margin })

/** Where the measured box `b` pokes out of `room` by more than `spare`, as sentences: none when it is inside. */
export function poking(what: string, b: Edges, room: Edges, spare: number): string[] {
  const out: string[] = []
  if (b.x0 < room.x0 - spare) out.push(`${what}: left ${b.x0.toFixed(3)} < ${room.x0.toFixed(3)}`)
  if (b.y0 < room.y0 - spare) out.push(`${what}: top ${b.y0.toFixed(3)} < ${room.y0.toFixed(3)}`)
  if (b.x1 > room.x1 + spare) out.push(`${what}: right ${b.x1.toFixed(3)} > ${room.x1.toFixed(3)}`)
  if (b.y1 > room.y1 + spare) out.push(`${what}: bottom ${b.y1.toFixed(3)} > ${room.y1.toFixed(3)}`)
  return out
}

/** A fake context that tells `hook` of every method call first, with the context as it is at the call. */
function spying(hook: (target: CanvasRenderingContext2D, key: string, args: unknown[]) => void): CanvasRenderingContext2D {
  const { ctx } = fakeContext()
  return new Proxy(ctx, {
    get(target, key: string) {
      const v = Reflect.get(target, key) as unknown
      if (typeof v !== 'function') return v
      return (...args: unknown[]) => {
        hook(target, key, args)
        return (v as (...a: unknown[]) => unknown)(...args)
      }
    },
    set: (target, key, value) => Reflect.set(target, key, value),
  })
}

/** The colours a drawing fills and strokes with, in the order it uses them. */
export function colours(draw: (ctx: CanvasRenderingContext2D) => void): string[] {
  const out: string[] = []
  draw(
    spying((c, key) => {
      if (key === 'fill') out.push(String(c.fillStyle))
      if (key === 'stroke') out.push(String(c.strokeStyle))
    }),
  )
  return out
}

/** Every call a drawing makes, with its numbers to six places: two drawings are the same picture when their calls match. */
export function calls(draw: (ctx: CanvasRenderingContext2D) => void): string[] {
  const out: string[] = []
  draw(spying((_, key, args) => out.push(`${key}(${args.map((a) => (typeof a === 'number' ? a.toFixed(6) : String(a))).join(',')})`)))
  return out
}

/** The pen as every draw test starts: 50 CSS px a cell at a pixel ratio of 2, the sticker shadow down-right. */
export function resetPen(): void {
  pen.ppm = 50
  pen.dpr = 2
  pen.shadowX = SHADOW
  pen.shadowY = SHADOW
}
