/**
 * Runs the road's world and the truck over their cases on the fake context, at street, road,
 * close and mirror sizes and at moments from the start to a very long time later (ages of
 * Infinity included), so art written without looking cannot crash, draw NaN, leave the
 * context changed or reach for an API that does not work everywhere; holds each drawing
 * to the box its callers crop or hit-test it by; checks the ground draws its whole span the
 * same whatever the time, as its chunk bakes need; that crossers have left the screen
 * when their crossing ends; that the road's sun is the street's, that the tunnel's walls
 * show no gem's colours, that the bridges stand where the road's def puts them, and that
 * every cat is animals.ts's. Looks are judged on the sheets
 * (?sheet=land, ?sheet=truck).
 */
import { afterEach, describe, expect, it } from 'vitest'

import type { View } from '../game/camera'
import { DEFAULT_LOOK } from '../game/catalog'
import { boulderRect, rect, type Rect } from '../game/layout'
import { BOULDER_HITS, GOODS, RAWS, ROAD_KINDS, TOOLS, type Crosser, type Good, type RoadDef } from '../game/model'
import { BALLOON_UP, makeRoad } from '../game/road'
import { CAT_COATS } from './animals'
import { fakeContext } from './fakeContext'
import { LAND_SHEET, drawBoulder, drawCrosser, drawHomeSign, drawPickup, drawPresent, drawRamp, drawRoadBackdrop, drawRoadCard, drawRoadFront, drawRoadGround, drawSurprise } from './land'
import { MATERIAL_LOOK, RAW_LOOK, SKY, pen } from './look'
import { drawStreetBackdrop } from './street'
import { TRUCK_SHEET, drawTruck, type TruckPic } from './truck'

/** CSS px per metre: the street, the road, a signpost card, a close look, the mirror. */
const SCALES = [40, 70, 80, 160, 400] as const
/** Moments: the start, a little in, a few seconds, and a very long session. */
const TIMES = [0, 0.37, 2.9, 1e5 + 0.21] as const
/** For the biggest loops (every hit, tool and age of a boulder; every step of a crossing): a scale at each detail level, and fewer moments. */
const LEVELS = [40, 80, 400] as const
const MOMENTS = [0, 2.9, 1e5 + 0.21] as const
/** Ages in seconds since a stamp: just now, settling, done, long ago, never. */
const AGES = [0, 0.05, 0.2, 0.45, 1.3, 1e4, Infinity] as const
const CROSSERS: readonly Crosser[] = ['ducks', 'cats', 'hedgehogs', 'cows']

afterEach(() => {
  pen.ppm = 80
  pen.dpr = 2
})

/** The colours `draw` fills with, in order, on the fake context. */
function fills(draw: (ctx: CanvasRenderingContext2D) => void): string[] {
  const { ctx } = fakeContext()
  const out: string[] = []
  const methods = ctx as unknown as Record<string, (...a: unknown[]) => unknown>
  const spy = new Proxy(ctx, {
    get: (target, key: string) => (key === 'fill' || key === 'fillRect' ? (...a: unknown[]) => (out.push(String(target.fillStyle).toUpperCase()), methods[key]!(...a)) : Reflect.get(target, key)),
    set: (target, key, value) => Reflect.set(target, key, value),
  })
  draw(spy)
  return out
}

/** Roads of every kind: the training road, a train trip and a balloon trip, from a few seeds. */
const ROADS: readonly RoadDef[] = ROAD_KINDS.flatMap((kind) => [makeRoad(kind, 1, 3), makeRoad(kind, 4, 7), makeRoad(kind, 5, 11), makeRoad(kind, 6, 2)])

/** Where the box `b` pokes out of `r` with `spare` metres to spare on every side, as sentences, none when it is inside (the fake context measures circles and the flat ground shadows exactly). The sweeps gather them and expect none at the end. */
function poking(what: string, b: { x0: number; y0: number; x1: number; y1: number }, r: Rect, spare: number): string[] {
  const out: string[] = []
  if (b.x0 < r.x - spare) out.push(`${what}: left ${b.x0.toFixed(3)}`)
  if (b.x1 > r.x + r.w + spare) out.push(`${what}: right ${b.x1.toFixed(3)}`)
  if (b.y0 < r.y - spare) out.push(`${what}: top ${b.y0.toFixed(3)}`)
  if (b.y1 > r.y + r.h + spare) out.push(`${what}: bottom ${b.y1.toFixed(3)}`)
  return out
}

describe('the backdrop', () => {
  it('draws every road from its start to past its sign, at every size and moment, day and sunset', () => {
    const { ctx, check } = fakeContext()
    for (const def of ROADS)
      for (const [w, h, ppm] of [
        [1180, 820, 70],
        [820, 1180, 106],
        [390, 844, 73],
      ] as const)
        // The moment turns with every step along the road, so each screen sees every moment all along it.
        for (let x = -10, k = 0; x < def.length + 40; x += 23, k++) {
          const t = TIMES[k % TIMES.length]!
          const view: View = { w, h, dpr: 2, ppm, x0: x - (0.35 * w) / ppm, y0: -7.6 }
          check(`${def.kind} ${def.trip} at ${x}, ${w}x${h}, t ${t}`, () => drawRoadBackdrop(ctx, def, view, t), 'none')
        }
  })
})

describe('the sun', () => {
  it('is the street\'s sun on the road: a pale ring, then the disc', () => {
    const street: View = { w: 1180, h: 820, dpr: 2, ppm: 42, x0: 0, y0: -16.8 }
    const day = fills((ctx) => drawStreetBackdrop(ctx, street, 0, 0))
    expect(day.indexOf(SKY.day.sun) - day.indexOf(SKY.day.halo), 'street').toBe(1)
    for (const def of ROADS) {
      const sky = SKY[def.sky]
      const road = fills((ctx) => drawRoadBackdrop(ctx, def, { w: 1180, h: 820, dpr: 2, ppm: 70, x0: 10, y0: -7.6 }, 0))
      expect(road.indexOf(sky.sun) - road.indexOf(sky.halo), `${def.kind} ${def.sky}`).toBe(1)
    }
  })
})

describe('the ground', () => {
  it('sets flat stones in the tunnel walls, never a gem\'s colours: the only gems there are the ones to collect', () => {
    // A level crossing's red is a gem's red too: the tunnels with no crossing near.
    const gem = Object.values(RAW_LOOK.gem)
    const tunnels = ROADS.flatMap((def) => def.biomes.filter((b) => b.biome === 'tunnel' && !def.things.some((th) => th.kind === 'surprise' && th.what === 'train' && th.x > b.from - 20 && th.x < b.to + 20)).map((b) => ({ def, ...b })))
    expect(tunnels.length).toBeGreaterThan(0)
    for (const { def, from, to } of tunnels) {
      const used = fills((ctx) => drawRoadGround(ctx, def, from, to, 0))
      expect(used.filter((c) => gem.includes(c)), `${def.kind} ${def.trip}`).toEqual([])
    }
  })

  it('draws every chunk of every road, the whole span and nothing that moves', () => {
    const { ctx, check, measure, counts } = fakeContext()
    /** The calls `draw` makes, by name. */
    const calls = (draw: () => void) => {
      const before = { ...counts }
      draw()
      return Object.fromEntries(Object.entries(counts).map(([key, n]) => [key, n - (before[key] ?? 0)]))
    }
    // Each road at one of the two detail levels, taking turns, so every kind of road is drawn at both.
    ROADS.forEach((def, r) => {
      pen.ppm = r % 2 === 0 ? 40 : 80
      for (let k = -1; k * 8 < def.ground.length; k++) {
        const x0 = k * 8 - 1
        const x1 = (k + 1) * 8 + 1
        let b = { x0: 0, y0: 0, x1: 0, y1: 0 }
        const once = calls(() => (b = measure(() => check(`${def.kind} ${def.trip} chunk ${k}, ${pen.ppm} px/m`, () => drawRoadGround(ctx, def, x0, x1, 0), 'none'))))
        expect(b.x0, `chunk ${k} reaches its left end`).toBeLessThanOrEqual(x0)
        expect(b.x1, `chunk ${k} reaches its right end`).toBeGreaterThanOrEqual(x1)
        // The same calls whatever the time: a bake made now looks the same as one made later.
        expect(calls(() => drawRoadGround(ctx, def, x0, x1, 41.7)), `chunk ${k} draws the same later`).toEqual(once)
      }
    })
  })

  it('draws what stands in front of the truck along every road, swaying', () => {
    const { ctx, check } = fakeContext()
    // Each road at both detail levels, the moment turning with every step along it.
    for (const def of ROADS)
      for (const ppm of [40, 80]) {
        pen.ppm = ppm
        for (let x = -10, k = 0; x < def.length + 40; x += 9, k++) {
          const t = TIMES[k % TIMES.length]!
          check(`${def.kind} front at ${x}, t ${t}, ${ppm} px/m`, () => drawRoadFront(ctx, def, x - 7, x + 11, t), 'none')
        }
      }
  })

  it('lays a plank bridge on each of the road\'s bridges and nowhere else', () => {
    const deck = MATERIAL_LOOK.planks.top.toUpperCase()
    const post = MATERIAL_LOOK.planks.face.toUpperCase()
    const rivers = ROADS.filter((def) => def.bridges.length > 0)
    expect(rivers.length).toBeGreaterThan(0)
    for (const def of rivers)
      for (const { from, to } of def.bridges) {
        // The same river with its bridge moved off it: the deck and the near rail's posts go with the bridge.
        const moved: RoadDef = { ...def, bridges: def.bridges.map((b) => (b.from === from ? { from: from + 40, to: to + 40 } : b)) }
        const ground = (d: RoadDef, a: number) => fills((ctx) => drawRoadGround(ctx, d, a, a + to - from, 0))
        const front = (d: RoadDef, a: number) => fills((ctx) => drawRoadFront(ctx, d, a, a + to - from, 0))
        const what = `${def.kind} ${def.trip} bridge at ${from}`
        expect(ground(def, from), what).toContain(deck)
        expect(front(def, from), what).toContain(post)
        expect(ground(moved, from), what).not.toContain(deck)
        expect(front(moved, from), what).not.toContain(post)
        expect(ground(moved, from + 40), what).toContain(deck)
        expect(front(moved, from + 40), what).toContain(post)
      }
  })
})

describe('the things on the road', () => {
  it('keeps a pickup bobbing within its spot', () => {
    const { ctx, check, measure } = fakeContext()
    const out: string[] = []
    for (const ppm of SCALES) {
      pen.ppm = ppm
      for (const good of RAWS)
        check(
          `pickup ${good} at ${ppm} px/m`,
          () => {
            for (const t of [...TIMES, 0.9, 1.3, 2.4])
              // Its light spot reaches a little under the ground line it lies on.
              for (const phase of [0, 0.5, 0.99]) out.push(...poking(`pickup ${good} at ${t}, phase ${phase}, ${ppm} px/m`, measure(() => drawPickup(ctx, good, t, phase)), rect(-0.36, -0.8, 0.72, 0.9), 0))
          },
          'none',
        )
    }
    expect(out).toEqual([])
  })

  it('draws a boulder through every hit with every tool, inside its rect and the stop strip\'s crop', () => {
    const { ctx, check, measure } = fakeContext()
    const road = makeRoad('forest', 4, 7)
    const out: string[] = []
    // Every hit at every age, with and without its gem, at each detail level; the tool and the moment turn from one to the next, so each tool meets most of the hits and ages. One check holds a boulder's ages together: an age that leaves the context changed leaves it changed at the end of them too.
    LEVELS.forEach((ppm, l) => {
      pen.ppm = ppm
      for (const size of ['small', 'big'] as const) {
        const r = boulderRect(road, 0, size)
        const own = rect(r.x, r.y - road.ground[0]!, r.w, r.h)
        for (const gem of [false, true])
          for (let hits = 0; hits < BOULDER_HITS[size]; hits++)
            check(
              `${size} boulder, gem ${gem}, ${hits} hits, ${ppm} px/m`,
              () =>
                AGES.forEach((age, a) => {
                  const tool = TOOLS[(hits + a + 2 * Number(gem) + l) % TOOLS.length]!
                  const t = MOMENTS[(hits + a) % MOMENTS.length]!
                  const b = measure(() => drawBoulder(ctx, size, gem, hits, age, tool, t))
                  const what = `${size} boulder, gem ${gem}, ${hits} hits by the ${tool} ${age} s ago at ${t}, ${ppm} px/m`
                  out.push(...poking(what, b, own, 0.25))
                  if (hits === 0 && age === Infinity) out.push(...poking(`${what}, on the stop strip`, b, rect(-1, -1.9, 2, 2), 0))
                }),
              'none',
            )
      }
    })
    expect(out).toEqual([])
  })

  it('walks each family across and off the bottom of the screen, waving when it answers', () => {
    const { ctx, check, measure } = fakeContext()
    const out: string[] = []
    // Every step across at every size, each with two of the answer's ages and a moment, turning from step to step. One check holds a family's steps together: a step that leaves the context changed leaves it changed at the end of them too.
    SCALES.forEach((ppm, s) => {
      pen.ppm = ppm
      for (const who of CROSSERS)
        check(
          `${who} crossing at ${ppm} px/m`,
          () => {
            for (let i = 0; i <= 12; i++)
              for (const answer of [AGES[(i + s) % AGES.length]!, AGES[(i + s + 3) % AGES.length]!]) {
                const u = (i - 1) / 10
                const t = MOMENTS[(i + s) % MOMENTS.length]!
                const b = measure(() => drawCrosser(ctx, who, u, answer, t))
                if (b.x0 < -2 || b.x1 > 1.6) out.push(`${who} at ${u}, answered ${answer} s ago, at ${t}, ${ppm} px/m: x ${b.x0.toFixed(3)} to ${b.x1.toFixed(3)}`)
              }
          },
          'none',
        )
    })
    pen.ppm = 70
    for (const who of CROSSERS) {
      // Waiting, they fit the hit target and the stop strip's crop; across, the last one is below the road's view (2.67 m under the ground).
      out.push(...poking(`${who} waiting`, measure(() => drawCrosser(ctx, who, 0, 1e4, 1.2)), rect(-1.3, -1.1, 2.6, 1.2), 0))
      expect(measure(() => drawCrosser(ctx, who, 1, 1e4, 1.2)).y0, `${who} across`).toBeGreaterThan(2.9)
    }
    expect(out).toEqual([])
  })

  it('draws the ramp under the line the wheels roll on, and the present shut and opening', () => {
    const { ctx, check, measure } = fakeContext()
    for (const ppm of SCALES) {
      pen.ppm = ppm
      for (const t of TIMES) {
        check('ramp', () => drawRamp(ctx, t), 'none')
        // The ramp's shadow, under all of it, is 1.75 m either side of its middle.
        const ramp = measure(() => drawRamp(ctx, t))
        expect(ramp.x0, 'ramp: left').toBeGreaterThanOrEqual(-3.3)
        expect(ramp.x1, 'ramp: right').toBeLessThanOrEqual(0.3)
        expect(ramp.y1, 'ramp: bottom').toBeLessThanOrEqual(1.75)
        expect(poking(`present shut at ${t}`, measure(() => check('present shut', () => drawPresent(ctx, t, -1), 'none')), rect(-0.5, -0.9, 1, 1), 0)).toEqual([])
        for (const open of [0, 0.1, 0.3, 0.6, 1, 1.5, 3, 1e4]) expect(poking(`present open ${open}`, measure(() => check(`present open ${open}`, () => drawPresent(ctx, t, open), 'none')), rect(-1, -1.75, 2, 1.85), 0)).toEqual([])
      }
    }
  })

  it('runs the train and the balloon through their shows', () => {
    const { ctx, check, measure } = fakeContext()
    const out: string[] = []
    // Every step of each show at every size, the moment turning from step to step. One check holds a show's steps together: a step that leaves the context changed leaves it changed at the end of them too.
    SCALES.forEach((ppm, s) => {
      pen.ppm = ppm
      for (const what of ['train', 'balloon'] as const)
        check(
          `the ${what} at ${ppm} px/m`,
          () => {
            for (let k = 0, u = -0.1; u <= 1.1; u += 0.02, k++) {
              const t = TIMES[(k + s) % TIMES.length]!
              // The train runs along its track (shown only out of the bush at its back end), the balloon floats in from the left and off up to the right, its gem hanging a quarter metre under where it drops it, BALLOON_UP over the road.
              out.push(...poking(`${what} at ${u}, t ${t}, ${ppm} px/m`, measure(() => drawSurprise(ctx, what, u, t)), what === 'train' ? rect(-11, -6, 37, 18) : rect(-12, -13.5, 21, 13.5 - BALLOON_UP + 0.25), 0))
            }
          },
          'none',
        )
    })
    expect(out).toEqual([])
  })

  it("swings the crossing's barrier up as the train's show ends, never down into the field", () => {
    const { ctx, measure } = fakeContext()
    // Down, its arm lies across the road at its pivot, 0.17 m over the ground line; as it goes up, nothing of the show reaches under the ground line.
    for (const u of [0.9, 0.92, 0.95, 0.98, 1]) expect(measure(() => drawSurprise(ctx, 'train', u, 0.3)).y1, `${u}`).toBeLessThan(0)
  })

  it('fits the home sign and the road cards to their pictures', () => {
    const { ctx, check, measure } = fakeContext()
    for (const ppm of SCALES) {
      pen.ppm = ppm
      for (const t of TIMES) {
        expect(poking('home sign', measure(() => check('home sign', () => drawHomeSign(ctx, t), 'none')), rect(-0.7, -2.5, 1.4, 2.6), 0)).toEqual([])
        for (const kind of ROAD_KINDS) expect(poking(`card ${kind}`, measure(() => check(`card ${kind}`, () => drawRoadCard(ctx, kind, t), 'none')), rect(-1.5, -1, 3, 2), 0.01)).toEqual([])
      }
    }
  })
})

describe('the cats', () => {
  it('are animals.ts\'s one cat: Socks in the truck, the cat family on the road, the balloon\'s cat', () => {
    pen.ppm = 160
    const truck = fills((ctx) => drawTruck(ctx, { look: DEFAULT_LOOK, bed: [], tip: 0, roll: 0, speed: 0, honk: 0.6, flick: Infinity, stickers: 0, driver: true, t: 0 }))
    expect(truck).toContain(CAT_COATS.tuxedo.fur)
    for (const u of [0, 0.5, 1]) {
      const family = fills((ctx) => drawCrosser(ctx, 'cats', u, 0.3, 1.2))
      expect(family, `cats at ${u}`).toContain(CAT_COATS.ginger.fur)
      expect(family, `cats at ${u}`).toContain(CAT_COATS.grey.fur)
    }
    expect(fills((ctx) => drawSurprise(ctx, 'balloon', 0.3, 1.2))).toContain(CAT_COATS.cream.fur)
  })
})

describe('the truck', () => {
  const bed = (n: number): Good[] => Array.from({ length: n }, (_, i) => GOODS[(i * 7) % GOODS.length]!)
  const pic = (patch: Partial<TruckPic>): TruckPic => ({ look: DEFAULT_LOOK, bed: [], tip: 0, roll: 0, speed: 0, honk: Infinity, flick: Infinity, stickers: 0, driver: true, t: 0, ...patch })

  it('draws every load, tip, speed, honk, landing, sticker count and door', () => {
    const { ctx, check } = fakeContext()
    // A third of the loads, tips, speeds and ages, those whose places add up to a multiple of three: every three of the four still meet in every way. The size turns from one to the next.
    let k = 0
    ;[0, 1, 8, 21, 30, 44].forEach((n, i) =>
      [0, 0.2, 0.6, 1].forEach((tip, j) =>
        [0, 2.5, 8, 14].forEach((speed, l) =>
          AGES.forEach((age, a) => {
            if ((i + j + l + a) % 3 !== 0) return
            pen.ppm = SCALES[k++ % SCALES.length]
            const p = pic({ bed: bed(n), tip, roll: speed * 3.1, speed, honk: age, flick: age, stickers: n % 17, driver: n % 2 === 0, t: 2.2 + n })
            check(`truck ${n} ${tip} ${speed} ${age}, ${pen.ppm} px/m`, () => drawTruck(ctx, p), 'none')
          }),
        ),
      ),
    )
    SCALES.forEach((ppm, s) => {
      pen.ppm = ppm
      TIMES.forEach((t, i) => {
        for (const stickers of [0, 3, 6, 7, 12, 40].filter((_, j) => (i + j + s) % 2 === 0)) check(`truck at ${t}, ${stickers} stickers, ${ppm} px/m`, () => drawTruck(ctx, pic({ t, stickers, roll: t })), 'none')
      })
    })
  })

  it('keeps its heap in the truck however full, and stands in its own length', () => {
    const { ctx, measure } = fakeContext()
    pen.ppm = 80
    for (const n of [0, 10, 30, 60])
      for (const t of [0, 0.4, 1.7]) {
        const b = measure(() => drawTruck(ctx, pic({ bed: bed(n), speed: 8, roll: t * 8, t })))
        // The puffs blow back over the bed, the heap peaks a little over the cab; its flat shadow (4.3 m wide) is 0.26 m deep.
        expect(poking(`truck with ${n} goods at ${t}`, b, rect(-2.5, -3.0, 5.0, 3.26), 0)).toEqual([])
      }
    for (const tip of [0.3, 0.7, 1]) expect(poking(`truck tipping ${tip}`, measure(() => drawTruck(ctx, pic({ bed: bed(30), tip }))), rect(-2.8, -4.3, 5.3, 4.56), 0)).toEqual([])
  })
})

describe('the sheets', () => {
  it('draw every entry of the land and the truck', () => {
    const { ctx, check } = fakeContext()
    // Each entry at two moments, every other entry at the other two.
    for (const [group, sheet] of Object.entries({ land: LAND_SHEET, truck: TRUCK_SHEET }))
      sheet.forEach((entry, i) => {
        for (const t of i % 2 === 0 ? [0, 2.6] : [1.1, 9.7]) check(`${group}: ${entry.label} at ${t}`, () => entry.draw(ctx, t), 'none')
      })
  })
})
