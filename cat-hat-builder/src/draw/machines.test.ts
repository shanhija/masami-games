/**
 * Runs the yard's draw functions (each machine at every stage: the empty pad with its ghost
 * and wish, the crate being hit, the crate opening, the machine idle, ready, pushed,
 * coughing and running through its batch; the heaps and the stacks; the machine sheet)
 * over their cases on the fake context at street, cab, room and mirror sizes, so art
 * written without looking cannot crash, draw NaN, leave the context changed or reach for an
 * API that does not work everywhere; and holds each drawing to its yard rect. Looks are
 * judged on ?sheet=machines and in the game.
 */
import { afterEach, describe, expect, it } from 'vitest'

import { MACHINES, MATERIALS, RAWS } from '../game/model'
import { fakeContext } from './fakeContext'
import { pen } from './look'
import { MACHINE_SHEET, drawHeap, drawMachine, drawStack, machinePic, type MachinePic } from './machines'

const SCALES = [40, 80, 160, 400] as const
/** Seconds since a stamp: through every short animation, past them, long ago, never. */
const AGES = [0, 0.04, 0.1, 0.2, 0.3, 0.45, 0.6, 0.8, 0.95, 1.2, 3, 1e4, Infinity] as const

afterEach(() => {
  pen.ppm = 80
  pen.dpr = 2
})

/** A built machine's moment: running through its batch at `u` of it, or resting; every other stamp at `age`. */
function pic(stage: MachinePic['stage'], on: boolean, u: number, age: number, ready: boolean): MachinePic {
  return { stage, on, batchAge: on ? u * 0.8 : Infinity, batchFor: 0.8, pushAge: age, coughAge: age, hits: Math.floor(u * 4), hitAge: age, builtAge: age, ready }
}

describe('the machines', () => {
  it('draw every machine at every stage, moment and size, inside the station', () => {
    const { ctx, check, measure } = fakeContext()
    const out: string[] = []
    // Every age of every stage, running and not, at every size; the point in the batch turns from one to the next, so each meets every age over the sizes. One check holds a stage's ages together: an age that leaves the context changed leaves it changed at the end of them too.
    SCALES.forEach((ppm, s) => {
      pen.ppm = ppm
      for (const m of MACHINES)
        for (const stage of ['pad', 'crate', 'built'] as const)
          for (const on of [false, true])
            check(
              `${m} ${stage} ${on ? 'running' : 'resting'} at ${ppm} px/m`,
              () =>
                AGES.forEach((age, a) => {
                  const u = [0, 0.3, 0.55, 0.9][(a + s + Number(on)) % 4]!
                  const t = 3.3 + u
                  const b = measure(() => drawMachine(ctx, m, pic(stage, on, u, age, !on), t))
                  // Opening, the crate's walls fall flat beside the pad for a moment, over the heap's and the stack's edges.
                  const side = stage === 'built' && age < 1 ? 2.25 : 1.3
                  // Under the ground line only the flat ground shadow (2.3 m wide, 0.14 m deep) and the dust at the foot, the machine growing out of its crate included; once the crate's front has fallen (from 0.25 s) it lies flat towards us.
                  const bottom = stage === 'built' && age >= 0.25 && age < 1 ? 0.45 : 0.16
                  if (b.x0 < -side || b.x1 > side + 0.05 || b.y0 < -3.4 || b.y1 > bottom)
                    out.push(`${m} ${stage} ${on ? 'running' : 'resting'} ${age} s on at ${u} of a batch, ${ppm} px/m: x ${b.x0.toFixed(3)} to ${b.x1.toFixed(3)}, y ${b.y0.toFixed(3)} to ${b.y1.toFixed(3)}`)
                }),
              'none',
            )
    })
    expect(out).toEqual([])
  })

  it('keeps a resting machine near its rect: nothing over 2.85 m', () => {
    const { ctx, measure } = fakeContext()
    for (const m of MACHINES) expect(measure(() => drawMachine(ctx, m, pic('built', false, 0, Infinity, false), 2)).y0, m).toBeGreaterThanOrEqual(-2.85)
  })

  it('draws a machine that has never run (no batch length yet) and the HUD picture', () => {
    const { ctx, check } = fakeContext()
    for (const m of MACHINES)
      for (const on of [false, true]) {
        const p: MachinePic = { stage: 'built', on, batchAge: Infinity, batchFor: 0, pushAge: Infinity, coughAge: Infinity, hits: 0, hitAge: Infinity, builtAge: Infinity, ready: false }
        check(`${m} ${on} never`, () => drawMachine(ctx, m, p, 1e5), 'none')
      }
  })
})

describe('the heaps and the stacks', () => {
  it('draw every good at every count and size', () => {
    const { ctx, check } = fakeContext()
    // Every count of every good, the size turning from count to count, so each good meets every size.
    for (const raw of RAWS)
      for (let n = 0; n <= 16; n++) {
        pen.ppm = SCALES[n % SCALES.length]
        check(`heap ${raw} ${n}, ${pen.ppm} px/m`, () => drawHeap(ctx, raw, n, 0.5 + n), 'none')
      }
    for (const material of MATERIALS)
      for (let n = 0; n <= 30; n++) {
        pen.ppm = SCALES[n % SCALES.length]
        check(`stack ${material} ${n}, ${pen.ppm} px/m`, () => drawStack(ctx, material, n, 0.5 + n), 'none')
      }
  })

  it('keep every heap and stack in its yard rect, the heap a mound and the stack growing up', () => {
    const { ctx, measure } = fakeContext()
    for (const raw of RAWS) {
      let top = 0
      for (let n = 1; n <= 14; n++) {
        const b = measure(() => drawHeap(ctx, raw, n, 0))
        expect(b.x0, `${raw} ${n}`).toBeGreaterThanOrEqual(-1.0)
        expect(b.x1, `${raw} ${n}`).toBeLessThanOrEqual(1.0)
        expect(b.y0, `${raw} ${n}`).toBeGreaterThanOrEqual(-1.0)
        expect(b.y0, `${raw} ${n} never shrinks`).toBeLessThanOrEqual(top + 1e-9)
        top = b.y0
      }
    }
    for (const material of MATERIALS) {
      let top = 0
      for (let n = 0; n <= 27; n++) {
        const b = measure(() => drawStack(ctx, material, n, 0))
        expect(b.x0, `${material} ${n}`).toBeGreaterThanOrEqual(-0.8)
        expect(b.x1, `${material} ${n}`).toBeLessThanOrEqual(0.8)
        expect(b.y0, `${material} ${n}`).toBeGreaterThanOrEqual(-1.2)
        expect(b.y0, `${material} ${n} never shrinks`).toBeLessThanOrEqual(top + 1e-9)
        top = b.y0
      }
    }
  })
})

describe('the machine sheet', () => {
  it('draws every entry', () => {
    const { ctx, check } = fakeContext()
    for (const entry of MACHINE_SHEET) for (const t of [0, 0.45, 1.1, 2.6, 7.9]) check(`machines: ${entry.label} at ${t}`, () => entry.draw(ctx, t), 'none')
  })

  it('has a sheet moment for each stage', () => {
    for (const stage of ['pad', 'crate', 'built'] as const) expect(machinePic(stage, false, 1).stage).toBe(stage)
  })
})
