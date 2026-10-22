/**
 * Runs the builder rig over every wardrobe option in every pose, with and without the hat,
 * through each pose's moments at street size and at a moment of each at the cab, room and
 * mirror sizes, on the fake context: art written without looking cannot crash, draw NaN,
 * leave the context changed, draw text or reach for an API that does not work everywhere.
 * Holds the builder to 1.2 m to the ear tips and every picture of it to a 1.6 m square over
 * its feet, and the light-up sneakers to three changes a second. Holds the rig's frames,
 * hands and blend that props use to the rig as drawn, and the road's tool icon to a 0.5 m
 * tool centred on its button. Looks are judged on ?sheet=builder.
 */
import { afterEach, describe, expect, it } from 'vitest'

import { DEFAULT_LOOK, FRIENDS } from '../game/catalog'
import { BAGS, GLASSES, HAIRS, HAIR_COLORS, HAT_COLORS, PANTS, PARTS, POSES, SHIRTS, SHOES, SKINS, TOOLS, WEAR_COLORS, type Look, type Pose } from '../game/model'
import { BUILDER_SHEET, HEAD, PART_BOX, POSE_LENGTH, POSE_LOOPS, armTo, drawBuilder, drawRig, drawToolIcon, earFlick, handAt, inRig, mixRig, posed, rigPoint, type Rig } from './builder'
import { fakeContext } from './fakeContext'
import { pen } from './look'

/** CSS px per metre: the street, the cab, a room, the mirror. */
const SIZES = [48, 80, 180, 400] as const
/** Where every picture of the builder stays: 1.6 m square, centred over the feet, its bottom a little under them for the soles and the shadow. */
const BOUNDS = { x0: -0.8, x1: 0.8, y0: -1.55, y1: 0.05 } as const

afterEach(() => {
  pen.ppm = 80
  pen.dpr = 2
})

/** Every shape option of every part, each on the default builder. */
const STYLES: readonly Partial<Look>[] = [
  ...HAIRS.map((hair) => ({ hair })),
  ...SHIRTS.map((shirt) => ({ shirt })),
  ...PANTS.map((pants) => ({ pants })),
  ...SHOES.map((shoes) => ({ shoes })),
  ...GLASSES.map((glasses) => ({ glasses })),
  ...BAGS.map((bag) => ({ bag })),
  ...TOOLS.map((tool) => ({ tool })),
]
/** Every colour option: they change no shape, so each runs through every pose at one size and moment. */
const COLOURS: readonly Partial<Look>[] = [
  ...HAT_COLORS.map((hat) => ({ hat })),
  ...HAIR_COLORS.map((hairColor) => ({ hairColor, hair: 'long' as const })),
  ...SKINS.map((skin) => ({ skin })),
  ...WEAR_COLORS.map((shirtColor) => ({ shirtColor, shirt: 'stripes' as const })),
  ...WEAR_COLORS.map((pantsColor) => ({ pantsColor, pants: 'work' as const })),
]
/** Each option worn by the builder (in the default yellow hat unless the option is a hat) and by a friend with no hat: the builder at even places, the friend at odd ones. */
const wearing = (patches: readonly Partial<Look>[]): Look[] => patches.flatMap((patch) => [{ ...DEFAULT_LOOK, ...patch }, { ...DEFAULT_LOOK, ...patch, hat: 'none' as const }])
/** Moments through a pose: eight steps through a little more than one length (where each pose reaches farthest), past it (a one-shot holds), and a long time on. */
const moments = (pose: Pose) => {
  const len = POSE_LENGTH[pose]
  return [...Array.from({ length: 8 }, (_, i) => (i / 7) * len * 1.1), len * 1.6, 913.7]
}
/** The builder waving the wand: drawBuilder adds to the rig a ground shadow and, for a builder in a hat with the wand, its trail, both the same whatever else they wear. */
const WAND: Look = { ...DEFAULT_LOOK, tool: 'wand' }

type Box = { x0: number; y0: number; x1: number; y1: number }
/**
 * The poses whose farthest reach over what `sweep` measures leaves the 1.6 m square, as
 * sentences. `grow` takes each measured box; the bottom counts only a figure's (`figure`),
 * not the shadow under it. One check holds each pose's moments together in the sweeps: a
 * moment that leaves the context changed leaves it changed at the end of them too.
 */
function outside(sweep: (grow: (pose: Pose, b: Box, figure: boolean) => void) => void): string[] {
  const reach: Partial<Record<Pose, Box>> = {}
  sweep((pose, b, figure) => {
    const r = (reach[pose] ??= { x0: 0, x1: 0, y0: 0, y1: -1 })
    r.x0 = Math.min(r.x0, b.x0)
    r.x1 = Math.max(r.x1, b.x1)
    r.y0 = Math.min(r.y0, b.y0)
    if (figure) r.y1 = Math.max(r.y1, b.y1)
  })
  return Object.entries(reach)
    .filter(([, r]) => r.x0 < BOUNDS.x0 || r.x1 > BOUNDS.x1 || r.y0 < BOUNDS.y0 || r.y1 > BOUNDS.y1)
    .map(([pose, r]) => `${pose}: x ${r.x0.toFixed(3)} to ${r.x1.toFixed(3)}, y ${r.y0.toFixed(3)} to ${r.y1.toFixed(3)}`)
}

describe('the builder rig', () => {
  // The street size draws the hat's ears biggest and every pose reaches farthest there, so each option goes through every moment there: half with the hat and half without, a different half in each pose.
  it('draws every option in every pose, with and without the hat, through the pose at street size, inside a 1.6 m square over the feet', { timeout: 20_000 }, () => {
    const { ctx, check, measure } = fakeContext()
    pen.ppm = SIZES[0]
    const out = outside((grow) =>
      wearing(STYLES).forEach((look, l) =>
        POSES.forEach((pose, p) => {
          const at = moments(pose).filter((_, m) => (m + l + p) % 2 === 0)
          check(`${JSON.stringify(look)} ${pose} at ${at.join(', ')} s`, () => at.forEach((u) => grow(pose, measure(() => drawRig(ctx, look, posed(pose, u))), true)), 'none')
        }),
      ),
    )
    expect(out).toEqual([])
  })

  // The cab, room and mirror sizes draw the details the street leaves out: each option at one of them in each pose, the size and the moment turning from look to look. The shadow and the wand's trail go through every moment at every size.
  it('draws every option in every pose, with and without the hat, at the other sizes, and the shadow and the wand\'s trail at every size and moment, inside a 1.6 m square over the feet', { timeout: 20_000 }, () => {
    const { ctx, check, measure } = fakeContext()
    const out = outside((grow) => {
      wearing(STYLES).forEach((look, l) =>
        check(
          `${JSON.stringify(look)} in every pose at the cab, room and mirror sizes`,
          () =>
            POSES.forEach((pose, p) => {
              const all = moments(pose)
              const u = all[(l + p) % all.length]!
              pen.ppm = SIZES[1 + ((l + p) % 3)]
              grow(pose, measure(() => drawRig(ctx, look, posed(pose, u))), true)
            }),
          'none',
        ),
      )
      for (const ppm of SIZES) {
        pen.ppm = ppm
        for (const pose of POSES) check(`the wand ${pose}, ${ppm} px/m`, () => moments(pose).forEach((u) => grow(pose, measure(() => drawBuilder(ctx, WAND, pose, u)), false)), 'none')
      }
    })
    expect(out).toEqual([])
  })

  it('draws every colour option in every pose, with and without the hat', () => {
    const { ctx, check } = fakeContext()
    // Each pose at a size and a moment turning from pose to pose and look to look; one check holds a look's poses together.
    wearing(COLOURS).forEach((look, l) =>
      check(
        `${JSON.stringify(look)} in every pose`,
        () =>
          POSES.forEach((pose, p) => {
            const all = moments(pose)
            pen.ppm = SIZES[(l + p) % SIZES.length]
            drawBuilder(ctx, look, pose, all[(l + 3 * p) % all.length]!)
          }),
        'none',
      ),
    )
  })

  it('draws the friends and 60 random outfits in every pose, each at one of the sizes', () => {
    const { ctx, check } = fakeContext()
    let seed = 7
    const pick = <T>(list: readonly T[]) => {
      seed = (seed * 16807) % 2147483647
      return list[seed % list.length]!
    }
    const random = Array.from(
      { length: 60 },
      (): Look => ({
        hat: pick([...HAT_COLORS, 'none'] as const),
        hair: pick(HAIRS),
        hairColor: pick(HAIR_COLORS),
        skin: pick(SKINS),
        shirt: pick(SHIRTS),
        shirtColor: pick(WEAR_COLORS),
        pants: pick(PANTS),
        pantsColor: pick(WEAR_COLORS),
        shoes: pick(SHOES),
        glasses: pick(GLASSES),
        bag: pick(BAGS),
        tool: pick(TOOLS),
      }),
    )
    for (const [k, look] of [...FRIENDS, ...random].entries()) {
      pen.ppm = SIZES[k % SIZES.length]
      check(`${JSON.stringify(look)} in every pose, ${pen.ppm} px/m`, () => POSES.forEach((pose) => drawBuilder(ctx, look, pose, 0.37 * POSE_LENGTH[pose])), 'none')
    }
  })

  it('makes a finite picture for a stamp of never, long ago or not yet', () => {
    const { ctx, check } = fakeContext()
    for (const pose of POSES)
      for (const u of [Infinity, -Infinity, NaN, 1e12, -1e12, -3]) {
        check(`${pose} at ${u}`, () => drawBuilder(ctx, { ...DEFAULT_LOOK, tool: 'wand', bag: 'jetpack' }, pose, u), 'none')
        check(`${pose} rig at ${u}`, () => drawRig(ctx, DEFAULT_LOOK, { ...posed(pose, u), flick: earFlick(u) }), 'none')
      }
  })

  it('stands 1.2 m to the ear tips with the feet on the ground', () => {
    const { ctx, measure } = fakeContext()
    pen.ppm = 400
    for (const u of [0, 0.6, 1.2, 1.8]) {
      const box = measure(() => drawRig(ctx, DEFAULT_LOOK, posed('stand', u)))
      expect(box.y0, `ear tips at ${u} s`).toBeGreaterThan(-1.23)
      expect(box.y0, `ear tips at ${u} s`).toBeLessThan(-1.17)
      expect(box.y1, `soles at ${u} s`).toBeGreaterThan(-0.01)
      expect(box.y1, `soles at ${u} s`).toBeLessThan(0.01)
    }
  })

  it('blinks the light-up sneakers at most three times a second on each foot, and lights them on steps', () => {
    for (const pose of POSES) {
      for (const side of [0, 1] as const) {
        const changes: number[] = []
        let was = posed(pose, 0).lights[side]
        for (let i = 1; i <= 600; i++) {
          const now = posed(pose, i / 60).lights[side]
          if (now !== was) changes.push(i / 60)
          was = now
        }
        for (let i = 3; i < changes.length; i++) expect(changes[i]! - changes[i - 3]!, `${pose} foot ${side}`).toBeGreaterThanOrEqual(1 - 1e-9)
      }
    }
    // Walking, each foot lights while it is planted: never both, never neither.
    for (let i = 0; i < 42; i++) {
      const [far, near] = posed('walk', i / 60).lights
      expect(far !== near, `walk at ${i}/60 s`).toBe(true)
    }
  })

  it('holds a one-shot pose at its end and comes back round in a looping one', () => {
    for (const pose of POSES) {
      const len = POSE_LENGTH[pose]
      const { eyes, lights, ...end } = posed(pose, POSE_LOOPS[pose] ? 0 : len)
      void eyes
      void lights
      const { eyes: e2, lights: l2, ...again } = posed(pose, POSE_LOOPS[pose] ? len * 3 : len + 5)
      void e2
      void l2
      for (const [key, value] of Object.entries(end)) {
        const other = (again as Record<string, unknown>)[key]
        if (typeof value === 'number') expect(other as number, `${pose} ${key}`).toBeCloseTo(value, 6)
        else if (Array.isArray(value)) value.forEach((v, i) => expect((other as number[])[i]!, `${pose} ${key}`).toBeCloseTo(v as number, 6))
        else expect(other, `${pose} ${key}`).toEqual(value)
      }
    }
  })

  it('flicks the hat ears for under half a second and is still before and after', () => {
    expect(earFlick(-0.1)).toBe(0)
    expect(earFlick(Infinity)).toBe(0)
    expect(earFlick(0.45)).toBe(0)
    expect(Math.abs(earFlick(0.06))).toBeGreaterThan(0.1)
  })
})

describe('the wardrobe buttons', () => {
  it('frame a part of the standing builder each, the hat with its ears and the shoes with their soles', () => {
    const { ctx, measure } = fakeContext()
    pen.ppm = 180
    const figure = measure(() => drawRig(ctx, DEFAULT_LOOK, posed('stand', 0.6)))
    for (const part of PARTS) {
      const b = PART_BOX[part]
      expect(Math.min(b.w, b.h), `${part} is big enough to see`).toBeGreaterThan(0.3)
      expect(b.w / b.h, `${part} is about square, like its button`).toBeGreaterThan(0.8)
      expect(b.w / b.h, `${part} is about square, like its button`).toBeLessThan(1.25)
      expect(b.x + b.w / 2, `${part} centre`).toBeGreaterThan(figure.x0)
      expect(b.x + b.w / 2, `${part} centre`).toBeLessThan(figure.x1)
      expect(b.y + b.h / 2, `${part} centre`).toBeGreaterThan(figure.y0)
      expect(b.y + b.h / 2, `${part} centre`).toBeLessThan(figure.y1)
    }
    expect(PART_BOX.hat.y, 'the hat button shows the ear tips').toBeLessThan(figure.y0)
    expect(PART_BOX.shoes.y + PART_BOX.shoes.h, 'the shoes button shows the soles').toBeGreaterThan(figure.y1)
  })
})

describe('the builder sheet', () => {
  it('draws every entry at a few moments', () => {
    const { ctx, check } = fakeContext()
    // Each entry at two moments, every other entry at the other two.
    BUILDER_SHEET.forEach((entry, i) => {
      for (const t of i % 2 === 0 ? [0, 1.3] : [0.45, 2.9]) check(`${entry.label} at ${t}`, () => entry.draw(ctx, t), 'none')
    })
  })
})

describe('what props hold on to', () => {
  /** The centre of what `draw` reaches, in the figure's own metres. */
  const centre = (measure: ReturnType<typeof fakeContext>['measure'], draw: () => void) => {
    const b = measure(draw)
    return [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2] as const
  }

  it('put a hand, the head and a point of every frame where drawRig draws them, in every pose', () => {
    const { ctx, measure } = fakeContext()
    for (const pose of POSES)
      for (const u of [0, 0.4 * POSE_LENGTH[pose]]) {
        const rig = { ...posed(pose, u), lift: -0.07, sy: 0.93 }
        for (const side of [0, 1] as const) {
          const h = handAt(rig, side)
          const [x, y] = centre(measure, () => inRig(ctx, rig, 'upper', () => ctx.arc(h.x, h.y, 0.01, 0, Math.PI * 2)))
          const [px, py] = rigPoint(rig, 'upper', h.x, h.y)
          expect(px, `${pose} hand ${side} x`).toBeCloseTo(x, 9)
          expect(py, `${pose} hand ${side} y`).toBeCloseTo(y, 9)
        }
        for (const frame of ['body', 'head'] as const) {
          const [x, y] = centre(measure, () => inRig(ctx, rig, frame, () => ctx.arc(HEAD.x, HEAD.y, 0.01, 0, Math.PI * 2)))
          const [px, py] = rigPoint(rig, frame, HEAD.x, HEAD.y)
          expect(px, `${pose} ${frame} x`).toBeCloseTo(x, 9)
          expect(py, `${pose} ${frame} y`).toBeCloseTo(y, 9)
        }
      }
  })

  it('reach a hand to a point within the arm, and as far as it goes towards one beyond', () => {
    for (const [x, y] of [
      [0.2, -0.5],
      [0.3, -0.62],
      [0.1, -0.35],
      [0.2, -0.75],
    ] as const) {
      const [shoulder, elbow] = armTo(1, x, y)
      const rig: Rig = { ...posed('stand', 0), shoulder: [0.1, shoulder], elbow: [0.2, elbow] }
      const h = handAt(rig, 1)
      expect(h.x, `x for ${x}, ${y}`).toBeCloseTo(x, 9)
      expect(h.y, `y for ${x}, ${y}`).toBeCloseTo(y, 9)
    }
    const [shoulder, elbow] = armTo(1, 2, -0.575)
    const far = handAt({ ...posed('stand', 0), shoulder: [0.1, shoulder], elbow: [0.2, elbow] }, 1)
    expect(far.y).toBeCloseTo(-0.575, 6)
    expect(far.x).toBeGreaterThan(0.29)
  })

  it('blend two rigs from the one to the other', () => {
    const a = posed('stand', 0.3)
    const b = posed('cheer', 0.4)
    expect(mixRig(a, b, 0)).toEqual(a)
    const end = mixRig(a, b, 1)
    for (const key of ['lift', 'sy', 'hip', 'lean', 'nod'] as const) expect(end[key], key).toBeCloseTo(b[key], 12)
    expect(end.shoulder[1]).toBeCloseTo(b.shoulder[1], 12)
    expect(end.eyes).toBe(b.eyes)
  })
})

describe('the road tool button', () => {
  it('draws each tool alone, about 0.5 m tall, centred on the button, at every size and moment', () => {
    const { ctx, check, measure } = fakeContext()
    for (const ppm of [48, 150, 400]) {
      pen.ppm = ppm
      for (const tool of TOOLS)
        for (const t of [0.2, 0.4, 0.8, 0.9, 1.5]) {
          check(`${tool} at ${t}, ${ppm} px/m`, () => drawToolIcon(ctx, tool, t), 'none')
          const b = measure(() => drawToolIcon(ctx, tool, t))
          expect(Math.max(b.x1 - b.x0, b.y1 - b.y0), `${tool} size, tipped`).toBeGreaterThan(0.36)
          expect(Math.max(-b.x0, b.x1, -b.y0, b.y1), `${tool} inside its button at ${t}`).toBeLessThan(0.35)
          // Between its twinkles (the first half of every 1.6 s), the tool alone is centred.
          if (t % 1.6 >= 0.8) {
            expect(Math.abs(b.x0 + b.x1) / 2, `${tool} centred across`).toBeLessThan(0.01)
            expect(Math.abs(b.y0 + b.y1) / 2, `${tool} centred up and down`).toBeLessThan(0.01)
          }
        }
    }
  })
})
