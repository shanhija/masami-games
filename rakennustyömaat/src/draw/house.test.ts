/**
 * Runs the houses' draw functions (the room frames, the bare room, the roofs, the lift, the
 * doors, the blueprints, the ghosts and the house sheet) over their cases on the fake
 * context, at street, build, room and close-up sizes, so art written without looking cannot
 * crash, draw NaN, leave the context changed or reach for an API that does not work
 * everywhere; holds each drawing to the box its doc comment states; checks that a roof
 * beside a taller column never paints over it, that every door fills exactly the rect a
 * tap on it rings from, and that a row door covers only the outer edge of the floor slots
 * beside it. Looks are judged on ?sheet=house.
 */
import { afterEach, describe, expect, it } from 'vitest'

import { HOME_COLS, HOUSE_GRID, SHAPE_SIZE } from '../game/catalog'
import { CELL, DEPTH, HOUSE_X, LIFT_W, POST, ROOF_H, SLAB, SLOT_BOX, TOP, doorRects, gridLeft, houseRect, slotsOf } from '../game/layout'
import { MATERIALS, ROOFS, SHAPES, type HouseKind, type Plot } from '../game/model'
import { fakeContext } from './fakeContext'
import { CAT_COATS } from './animals'
import { HOME_DOORS, HOUSE_SHEET, drawBareRoom, drawBlueprint, drawDoors, drawGhost, drawLift, drawRoof, drawRoomFrame } from './house'
import { pen } from './look'
import { drawPlotGround } from './street'

/** CSS px per metre: the street, the build view, the room view, a close-up. */
const SCALES = [40, 80, 160, 400] as const
/** Sim times, from the start to long into a session. */
const TIMES = [0, 0.37, 1.9, 4.4, 13.1, 977.3]
/** A roof's ages since its style changed: through the pop, settled, the renderer's held "long ago", never. */
const AGES = [0, 0.05, 0.12, 0.18, 0.3, 0.7, 1, 1e4, Infinity]

afterEach(() => {
  pen.ppm = 80
  pen.dpr = 2
})

interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}
/** Where the box b pokes out of (x0, y0)-(x1, y1) by more than a millimetre, as sentences, none when it is inside. The sweeps gather them and expect none at the end. */
function poking(what: string, b: Box, x0: number, y0: number, x1: number, y1: number): string[] {
  const out: string[] = []
  if (b.x0 < x0 - 1e-3) out.push(`${what}: left ${b.x0.toFixed(4)}`)
  if (b.y0 < y0 - 1e-3) out.push(`${what}: top ${b.y0.toFixed(4)}`)
  if (b.x1 > x1 + 1e-3) out.push(`${what}: right ${b.x1.toFixed(4)}`)
  if (b.y1 > y1 + 1e-3) out.push(`${what}: bottom ${b.y1.toFixed(4)}`)
  return out
}

/**
 * A context that records the box and the colour of every path it fills or strokes, in the
 * coordinates it was made in (path points and control points, circles and rects whole, line
 * widths not counted), cut to the box of the clip in force: finer than the fake context's
 * one box round everything, for checking where each part of a drawing lands and in what.
 */
function recorder() {
  type M = [number, number, number, number, number, number]
  let m: M = [1, 0, 0, 1, 0, 0]
  let clip: Box = { x0: -Infinity, y0: -Infinity, x1: Infinity, y1: Infinity }
  const stack: { m: M; clip: Box }[] = []
  let pts: [number, number][] = []
  const painted: (Box & { colour: unknown })[] = []
  const props: Record<string, unknown> = {}
  const mul = (a: number, b: number, c: number, d: number, e: number, f: number) => {
    m = [m[0] * a + m[2] * b, m[1] * a + m[3] * b, m[0] * c + m[2] * d, m[1] * c + m[3] * d, m[0] * e + m[2] * f + m[4], m[1] * e + m[3] * f + m[5]]
  }
  const at = (...xy: number[]) => {
    for (let i = 0; i < xy.length; i += 2) pts.push([m[0] * xy[i]! + m[2] * xy[i + 1]! + m[4], m[1] * xy[i]! + m[3] * xy[i + 1]! + m[5]])
  }
  const round = (x: number, y: number, rx: number, ry: number) => at(x - rx, y - ry, x + rx, y - ry, x - rx, y + ry, x + rx, y + ry)
  /** The box of the current path cut to the clip, or null when nothing of it shows. */
  const shown = (): Box | null => {
    if (pts.length === 0) return null
    const xs = pts.map((p) => p[0])
    const ys = pts.map((p) => p[1])
    const b = { x0: Math.max(clip.x0, Math.min(...xs)), y0: Math.max(clip.y0, Math.min(...ys)), x1: Math.min(clip.x1, Math.max(...xs)), y1: Math.min(clip.y1, Math.max(...ys)) }
    return b.x0 < b.x1 && b.y0 < b.y1 ? b : null
  }
  const paint = (style: 'fillStyle' | 'strokeStyle') => () => {
    const b = shown()
    if (b) painted.push({ ...b, colour: props[style] })
  }
  const methods: Record<string, (...a: number[]) => unknown> = {
    save: () => stack.push({ m: [...m], clip }),
    restore: () => ({ m, clip } = stack.pop()!),
    clip: () => (clip = shown() ?? { x0: 0, y0: 0, x1: 0, y1: 0 }),
    translate: (x, y) => mul(1, 0, 0, 1, x!, y!),
    scale: (x, y) => mul(x!, 0, 0, y!, 0, 0),
    rotate: (a) => mul(Math.cos(a!), Math.sin(a!), -Math.sin(a!), Math.cos(a!), 0, 0),
    beginPath: () => (pts = []),
    moveTo: (x, y) => at(x!, y!),
    lineTo: (x, y) => at(x!, y!),
    quadraticCurveTo: (...a) => at(...a.slice(0, 4)),
    bezierCurveTo: (...a) => at(...a.slice(0, 6)),
    arcTo: (...a) => at(...a.slice(0, 4)),
    arc: (x, y, r) => round(x!, y!, r!, r!),
    ellipse: (x, y, rx, ry) => round(x!, y!, rx!, ry!),
    rect: (x, y, w, h) => at(x!, y!, x! + w!, y!, x!, y! + h!, x! + w!, y! + h!),
    fill: paint('fillStyle'),
    stroke: paint('strokeStyle'),
    getLineDash: () => [],
  }
  const ctx = new Proxy(props, {
    get: (target, key: string) => (key in methods ? methods[key] : key in target ? target[key] : () => {}),
    set: (target, key: string, value) => ((target[key] = value), true),
  }) as unknown as CanvasRenderingContext2D
  return { ctx, painted }
}

describe('the room frame', () => {
  it('draws every shape in every material, with and without its faces, inside its rect and the faces that show', () => {
    const { ctx, check, measure } = fakeContext()
    const out: string[] = []
    // One check holds a frame's faces together: a case that leaves the context changed leaves it changed at the end of them too.
    for (const ppm of SCALES) {
      pen.ppm = ppm
      for (const shape of SHAPES)
        for (const material of MATERIALS)
          check(
            `${shape} ${material} at ${ppm} px/m`,
            () => {
              const { w, h } = SHAPE_SIZE[shape]
              for (const top of [true, false])
                for (const right of [true, false]) {
                  const b = measure(() => drawRoomFrame(ctx, shape, material, top, right, 1.3))
                  out.push(...poking(`${shape} ${material} top ${top} right ${right} at ${ppm} px/m`, b, 0, top || right ? -DEPTH : 0, w * CELL + (top || right ? DEPTH : 0), h * CELL))
                }
            },
            'none',
          )
    }
    expect(out).toEqual([])
  })
})

describe('the bare room', () => {
  it('fills a room of every shape inside its interior, its sign swaying the whole time', () => {
    const { ctx, check, measure } = fakeContext()
    for (const ppm of SCALES) {
      pen.ppm = ppm
      for (const shape of SHAPES) {
        const { w, h } = SHAPE_SIZE[shape]
        const iw = w * CELL - 2 * POST
        const ih = h * CELL - TOP - SLAB
        for (const t of TIMES) {
          expect(poking(`${shape} at ${t}`, measure(() => check(`${shape} at ${t}`, () => drawBareRoom(ctx, iw, ih, t), 'none')), 0, 0, iw, ih)).toEqual([])
        }
      }
    }
  })
})

describe('the roofs', () => {
  it('draw every style in every material through the pop and long after, over their column and under the build view top', () => {
    const { ctx, check, measure } = fakeContext()
    const out: string[] = []
    // Every age at every size, the moment turning from one age to the next. One check holds a roof's ages together: an age that leaves the context changed leaves it changed at the end of them too.
    SCALES.forEach((ppm, s) => {
      pen.ppm = ppm
      for (const style of ROOFS)
        for (const material of MATERIALS)
          check(
            `${style} ${material} at ${ppm} px/m`,
            () =>
              AGES.forEach((age, a) => {
                const t = (a + s) % 2 === 0 ? 0 : 2.9
                // houseRect keeps 0.6 m over the roofs' ROOF_H; the gable's tiles run a little past its edges, clipped to it.
                out.push(...poking(`${style} ${material} age ${age} at ${t}, ${ppm} px/m`, measure(() => drawRoof(ctx, style, material, CELL, true, true, age, t)), -0.3, -ROOF_H - 0.6, CELL + DEPTH + 0.3, 0))
              }),
            'none',
          )
    })
    expect(out).toEqual([])
  })

  it('stand on the whole column once settled, so neighbours of one height meet', () => {
    const { ctx, measure } = fakeContext()
    for (const style of ROOFS)
      for (const material of MATERIALS) {
        const b = measure(() => drawRoof(ctx, style, material, CELL, true, true, Infinity, 0))
        expect(b.x0, `${style} ${material}`).toBeLessThanOrEqual(0)
        expect(b.x1, `${style} ${material}`).toBeGreaterThanOrEqual(CELL)
        expect(b.y1, `${style} ${material}`).toBeCloseTo(0, 6)
      }
  })

  it('stop at the wall of a taller column on either side, through the pop and long after, and reach over a lower one', () => {
    // Every age, at the street's size and the room view's in turn, against a taller column on the left, on the right and on both sides.
    const SIDES = [
      [false, true],
      [true, false],
      [false, false],
    ] as const
    for (const style of ROOFS)
      for (const material of MATERIALS) {
        AGES.forEach((age, a) => {
          pen.ppm = a % 2 === 0 ? 40 : 160
          for (const [left, right] of SIDES) {
            const what = `${style} ${material} left ${left} right ${right} age ${age} at ${pen.ppm} px/m`
            const { ctx, painted } = recorder()
            drawRoof(ctx, style, material, CELL, left, right, age, 1.3)
            expect(painted.length, what).toBeGreaterThan(0)
            for (const p of painted) {
              if (!left) expect(p.x0, `${what}: a part ${JSON.stringify(p)} past the left wall`).toBeGreaterThanOrEqual(-1e-9)
              if (!right) expect(p.x1, `${what}: a part ${JSON.stringify(p)} past the right wall`).toBeLessThanOrEqual(CELL + 1e-9)
            }
          }
        })
        // Beside a lower column (or none) its right eave and faces show past its column, and a pointed roof's left eave past its left wall.
        for (const ppm of [40, 160]) {
          pen.ppm = ppm
          const { ctx, painted } = recorder()
          drawRoof(ctx, style, material, CELL, true, true, Infinity, 1.3)
          expect(Math.max(...painted.map((p) => p.x1)), `${style} ${material} at ${ppm} px/m`).toBeGreaterThan(CELL + 0.05)
          if (style === 'pointed') expect(Math.min(...painted.map((p) => p.x0)), `${style} ${material} at ${ppm} px/m`).toBeLessThan(-0.05)
        }
      }
  })

  it('pop from their foot and settle exactly as they stand', () => {
    const { ctx, measure } = fakeContext()
    for (const style of ROOFS) {
      const still = measure(() => drawRoof(ctx, style, 'bricks', CELL, true, true, 1e4, 0))
      expect(measure(() => drawRoof(ctx, style, 'bricks', CELL, true, true, Infinity, 0))).toEqual(still)
      expect(measure(() => drawRoof(ctx, style, 'bricks', CELL, true, true, 0.7, 0))).toEqual(still)
      const early = measure(() => drawRoof(ctx, style, 'bricks', CELL, true, true, 0.03, 0))
      expect(early.y0, style).toBeGreaterThan(still.y0)
    }
  })
})

describe('the lift', () => {
  it('rides one to five floors at every size and moment inside its shaft, its cap and its right face', () => {
    const { ctx, check, measure } = fakeContext()
    const out: string[] = []
    // Every moment of every height, the size turning from moment to moment. One check holds a height's moments together: a moment that leaves the context changed leaves it changed at the end of them too.
    for (let floors = 1; floors <= HOUSE_GRID.tall.rows; floors++) {
      const h = floors * CELL
      check(
        `${floors} floors`,
        () => {
          for (let t = 0, k = 0; t < 40; t += 0.37, k++) {
            pen.ppm = SCALES[(k + floors) % SCALES.length]
            out.push(...poking(`${floors} floors at ${t}, ${pen.ppm} px/m`, measure(() => drawLift(ctx, h, t)), -0.06, -h - 0.3 - DEPTH, LIFT_W + DEPTH + 0.06, 0))
          }
        },
        'none',
      )
    }
    expect(out).toEqual([])
  })
})

describe('the lift cat', () => {
  it('is the game\'s one ginger cat, in its coat from animals.ts', () => {
    const { ctx, painted } = recorder()
    drawLift(ctx, 2 * CELL, 0.5)
    expect(painted.some((p) => p.colour === CAT_COATS.ginger.fur)).toBe(true)
  })
})

describe('the doors', () => {
  /** A plot with one room, so houseRect holds the lift's room. */
  const plot = (kind: HouseKind): Plot => ({ kind, roof: 'pointed', rooms: [{ id: 1, shape: 'small', col: 0, row: 0, material: 'bricks', theme: null, items: [null, null, null, null], wall: 0, floor: 0 }] })

  it('draw both kinds at every size, each door filling exactly the rect a tap on it rings from, inside the build view', () => {
    const { ctx, check, measure } = fakeContext()
    for (const ppm of SCALES) {
      pen.ppm = ppm
      for (const kind of ['tall', 'row'] as const)
        for (const t of TIMES) {
          const r = houseRect(0, plot(kind))
          const x = gridLeft(0)
          const b = measure(() => check(`${kind} at ${t}`, () => drawDoors(ctx, kind, t), 'none'))
          expect(poking(`${kind} at ${t}`, b, r.x - x, r.y, r.x + r.w - x, r.y + r.h)).toEqual([])
          // All the doors together reach exactly as far as their rects do.
          const doors = doorRects(0, plot(kind))
          expect(b.x0, `${kind} left`).toBeCloseTo(Math.min(...doors.map((d) => d.x)) - x, 6)
          expect(b.x1, `${kind} right`).toBeCloseTo(Math.max(...doors.map((d) => d.x + d.w)) - x, 6)
          expect(b.y0, `${kind} top`).toBeCloseTo(Math.min(...doors.map((d) => d.y)), 6)
          expect(b.y1, `${kind} bottom`).toBeCloseTo(0, 6)
        }
    }
  })

  it('fill each door rect exactly, one drawing per door, the tall house door clear of its lift', () => {
    for (const kind of ['tall', 'row'] as const) {
      const { ctx, painted } = recorder()
      drawDoors(ctx, kind, 0.5)
      const x = gridLeft(0)
      const doors = doorRects(0, plot(kind)).map((d) => ({ x0: d.x - x, y0: d.y, x1: d.x + d.w - x, y1: d.y + d.h }))
      for (const p of painted) expect(doors.some((d) => p.x0 >= d.x0 - 1e-9 && p.x1 <= d.x1 + 1e-9 && p.y0 >= d.y0 - 1e-9 && p.y1 <= d.y1 + 1e-9), `${kind}: a part ${JSON.stringify(p)} outside every door`).toBe(true)
      for (const d of doors) {
        const own = painted.filter((p) => p.x0 >= d.x0 - 1e-9 && p.x1 <= d.x1 + 1e-9)
        expect(Math.min(...own.map((p) => p.x0)), kind).toBeCloseTo(d.x0, 9)
        expect(Math.max(...own.map((p) => p.x1)), kind).toBeCloseTo(d.x1, 9)
        expect(Math.min(...own.map((p) => p.y0)), kind).toBeCloseTo(d.y0, 9)
        expect(Math.max(...own.map((p) => p.y1)), kind).toBeCloseTo(d.y1, 9)
      }
      if (kind === 'tall') for (const p of painted) expect(p.x0).toBeGreaterThanOrEqual(HOUSE_GRID.tall.cols * CELL + LIFT_W - 1e-9)
    }
  })

  it('give each row home a door wide enough to read as a door, covering only the outer sixth of the floor slots beside it', () => {
    for (const ppm of SCALES) {
      pen.ppm = ppm
      const row = recorder()
      drawDoors(row.ctx, 'row', 0.5)
      const g = HOUSE_GRID.row
      for (let col = 0; col < g.cols; col++)
        for (let r = 0; r < g.rows; r++)
          for (const slot of slotsOf('small')) {
            if (slot.kind !== 'floor') continue
            const b = SLOT_BOX.floor
            const s = { x0: col * CELL + slot.x + b.x0, y0: -(r + 1) * CELL + slot.y + b.y0, x1: col * CELL + slot.x + b.x1, y1: -(r + 1) * CELL + slot.y + b.y1 }
            for (const p of row.painted) {
              const over = Math.min(p.x1, s.x1) - Math.max(p.x0, s.x0)
              if (p.y1 <= s.y0 || p.y0 >= s.y1 || over <= 0) continue
              expect(over, `a door part ${JSON.stringify(p)} over the floor slot ${JSON.stringify(s)} at ${ppm} px/m`).toBeLessThanOrEqual((s.x1 - s.x0) / 6)
            }
          }
      // One door per home at the home's left edge, at least half a metre wide where the builder walks through, in the home's colour.
      for (let home = 0; home < g.cols / HOME_COLS; home++) {
        const edge = home * HOME_COLS * CELL
        expect(row.painted.some((p) => p.x0 < edge && p.x1 > edge && p.colour === HOME_DOORS[home]!.face), `home ${home}'s colour`).toBe(true)
      }
      for (let home = 0; home < g.cols / HOME_COLS; home++) {
        const edge = home * HOME_COLS * CELL
        const leaf = row.painted.filter((p) => p.x0 < edge && p.x1 > edge && p.y0 < -1.2 && p.y1 > -0.4)
        expect(Math.max(...leaf.map((p) => p.x1 - p.x0)), `home ${home}`).toBeGreaterThanOrEqual(0.5)
      }
    }
  })
})

describe('the row house\'s mailboxes', () => {
  it('each stand under their home\'s door in the door\'s colour, so each home reads as its own', () => {
    const { ctx, painted } = recorder()
    // The plot ground's origin is the plot's left edge; the grid starts HOUSE_X into it.
    drawPlotGround(ctx, 'row', 1e4, 0.5)
    const homes = HOUSE_GRID.row.cols / HOME_COLS
    expect(new Set(HOME_DOORS.map((d) => d.face)).size).toBe(homes)
    for (let home = 0; home < homes; home++) {
      const edge = HOUSE_X + home * HOME_COLS * CELL
      const boxes = painted.filter((p) => p.x0 > edge && p.x1 < edge + 1 && p.y1 > 0.2 && HOME_DOORS.some((d) => d.face === p.colour))
      expect(boxes.map((p) => p.colour), `home ${home}`).toEqual([HOME_DOORS[home]!.face])
    }
  })
})

describe('the blueprint and the ghosts', () => {
  it('draw the blueprint of both kinds over the whole grid and its faces', () => {
    const { ctx, check, measure } = fakeContext()
    for (const ppm of SCALES) {
      pen.ppm = ppm
      for (const kind of ['tall', 'row'] as const) {
        const g = HOUSE_GRID[kind]
        expect(poking(kind, measure(() => check(kind, () => drawBlueprint(ctx, kind, 0.4), 'none')), 0, -g.rows * CELL - DEPTH, g.cols * CELL + DEPTH, 0)).toEqual([])
      }
    }
  })

  it('draw every shape ghost, pressed or not, through its pulse, inside its room rect (pressed grows it a little)', () => {
    const { ctx, check, measure } = fakeContext()
    for (const ppm of SCALES) {
      pen.ppm = ppm
      for (const shape of SHAPES)
        for (const pressed of [false, true])
          for (let t = 0; t < 1; t += 0.125) {
            const { w, h } = SHAPE_SIZE[shape]
            const W = w * CELL
            const H = h * CELL
            const k = pressed ? 0.025 : 0
            expect(poking(`${shape} ${pressed} at ${t}`, measure(() => check(`${shape} ${pressed} at ${t}`, () => drawGhost(ctx, shape, pressed, t), 'none')), -k * W, -k * H, W * (1 + k), H * (1 + k))).toEqual([])
          }
    }
  })
})

describe('the house sheet', () => {
  it('draws every entry, each under its own label', () => {
    const { ctx, check } = fakeContext()
    const labels = HOUSE_SHEET.map((e) => e.label)
    expect(new Set(labels).size).toBe(labels.length)
    for (const ppm of [40, 120])
      for (const entry of HOUSE_SHEET) {
        pen.ppm = ppm
        for (const t of [0, 1.1, 2.6, 7.9]) check(`${entry.label} at ${t}`, () => entry.draw(ctx, t), 'none')
      }
  })
})
