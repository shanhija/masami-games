/**
 * Bodies that turn round their middle and states they are in: a cartwheel, a somersault and a
 * back flip round the middle that land on the feet (Sami's cartwheel turned round its feet), a
 * pivot that keeps the body where it is, lying down as before; sick, dizzy, wet, cold, sleepy,
 * hot and glowing with their timers, sway, slower walking and faces, what water, rain, snow and
 * a fire do by themselves, and getting better when sick runs out.
 */
import { describe, expect, it } from 'vitest'

import { bodyCenter, headFrame, footFrame, proportions, rootFrame } from './body'
import { effectName, hasEffect } from './effects'
import { actionEntry, itemEntry, makeSim, newLibrary, run, runUntil, step } from './testing'

const made = (id: string, code: string) => {
  const library = newLibrary()
  expect(library.addAction(actionEntry(id, [], code))).toEqual({ ok: true })
  return library
}

describe('turning round the middle', () => {
  it('cartwheels round its middle: the middle never dips toward the ground, the feet go over the head, and it lands upright on its feet with the pivot back at them', () => {
    const sim = makeSim({ library: made('cartwheel', "yield* me.flip('cartwheel', { turns: 2 })") })
    const alice = sim.world.actors[0]!
    const pr = proportions(alice.look)
    const x0 = alice.x
    sim.give('alice', [step('cartwheel')], true)
    let lowest = Infinity
    let feetUp = false
    let lowestHead = Infinity
    runUntil(sim, 'done', 'alice', 5, () => {
      if ((alice.pivot ?? 0) === 0) return
      lowest = Math.min(lowest, bodyCenter(alice)[1])
      lowestHead = Math.min(lowestHead, headFrame(alice).p[1])
      if (footFrame(alice, 'left').p[1] > headFrame(alice).p[1]) feetUp = true
    })
    expect(feetUp).toBe(true)
    // The head stays above the ground all the way round (round the feet, it went 1.2 m under).
    expect(lowestHead).toBeGreaterThan(-0.05)
    expect(lowest).toBeGreaterThan(pr.height * 0.3)
    expect(alice.roll).toBe(0)
    expect(alice.pitch).toBe(0)
    expect(alice.pivot).toBe(0)
    expect(alice.y).toBeCloseTo(0, 6)
    // To its left: +x for a kid facing +z.
    expect(alice.x - x0).toBeGreaterThan(2)
  })

  it('somersaults forward and back flips backward, round the middle too', () => {
    for (const [how, sign] of [['somersault', 1], ['backflip', -1]] as const) {
      const sim = makeSim({ library: made('flip', `yield* me.flip('${how}')`) })
      const alice = sim.world.actors[0]!
      const z0 = alice.z
      sim.give('alice', [step('flip')], true)
      let turned = 0
      runUntil(sim, 'done', 'alice', 4, () => {
        turned = sign > 0 ? Math.max(turned, alice.pitch) : Math.min(turned, alice.pitch)
      })
      expect(Math.abs(turned)).toBeGreaterThan(5)
      expect(Math.sign(alice.z - z0)).toBe(sign)
      expect(alice.pitch).toBe(0)
    }
  })

  it('keeps the body where it is when the pivot moves, and gives it back to the feet when the action ends', () => {
    const sim = makeSim({ library: made('tip', 'me.pivot = 0.5\nme.roll = 0.4\nyield* w.wait(0.2)') })
    const alice = sim.world.actors[0]!
    const me = sim.api.actors[0]!
    me.roll = 1.3
    me.pitch = -0.4
    const before = rootFrame(alice).p
    me.pivot = 0.7
    expect(me.pivot).toBe(0.7)
    rootFrame(alice).p.forEach((v, i) => expect(v).toBeCloseTo(before[i]!, 9))
    me.pivot = 7
    expect(me.pivot).toBe(1)
    me.pivot = 0
    rootFrame(alice).p.forEach((v, i) => expect(v).toBeCloseTo(before[i]!, 9))
    me.roll = 0
    me.pitch = 0
    alice.y = 0
    sim.give('alice', [step('tip')], true)
    runUntil(sim, 'done', 'alice', 2)
    expect(alice.pivot).toBe(0)
    run(sim, 1)
    expect(alice.roll).toBeCloseTo(0, 6)
    expect(alice.y).toBeCloseTo(0, 6)
  })

  it('still lies down round its feet: tipping without a pivot is as before', () => {
    const sim = makeSim({ library: made('lie', 'me.pitch = -Math.PI / 2\nyield') })
    const alice = sim.world.actors[0]!
    sim.give('alice', [step('lie')], true)
    sim.step()
    expect(alice.pivot).toBeUndefined()
    expect(rootFrame(alice).p).toEqual([alice.x, alice.y + alice.pose.bob, alice.z])
  })
})

describe('states', () => {
  it('takes a state by its name or a near word, with a time, shows it to code and ends it at 0', () => {
    const sim = makeSim()
    const me = sim.api.actors[0]!
    me.effect('ill', 5)
    me.effect('soaked', 3)
    me.effect('nonsense', 3)
    expect(me.effects).toEqual({ sick: 5, wet: 3 })
    run(sim, 1)
    expect(me.effects.sick).toBeCloseTo(4, 1)
    me.effect('wet', 0)
    expect(me.effects).not.toHaveProperty('wet')
    expect(effectName('drowsy')).toBe('sleepy')
    expect(effectName(42)).toBe(null)
    expect(structuredClone(sim.world)).toEqual(sim.world)
  })

  it('a sick body sways, looks sad, walks slower, and when it runs out lies down and gets better', () => {
    const sim = makeSim()
    const alice = sim.world.actors[0]!
    const steve = sim.world.actors[1]!
    sim.api.actors[0]!.effect('sick', 3)
    sim.step()
    expect(alice.sway).not.toBe(null)
    expect(alice.mood).toBe('sad')
    // The sway is on top of the pose: the hand moves with it, and the pose itself is untouched.
    expect(alice.pose.tilt).toBe(0)
    // Sent the same way, the sick one is slower.
    alice.x = -4
    steve.x = 4
    alice.z = steve.z = 4
    sim.give('alice', [step('walk', { target: '-4,-2' })], true)
    sim.give('steve', [step('walk', { target: '4,-2' })], true)
    run(sim, 2)
    expect(4 - alice.z).toBeLessThan(0.7 * (4 - steve.z))
    // It runs out: a lie-down, then up again, all better.
    let lay = false
    const lines: string[] = []
    run(sim, 5, () => {
      if (Math.abs(alice.pitch) > 1.2) lay = true
      if (alice.bubble !== null) lines.push(alice.bubble.text)
    })
    expect(lay).toBe(true)
    expect(lines).toContain('All better!')
    expect(alice.effects).toBeUndefined()
    expect(alice.sway).toBe(null)
    expect(alice.pitch).toBeCloseTo(0, 6)
  })

  it('makes a body wet in water and rain, cold in snow, and a fire near dries and warms it', () => {
    const library = newLibrary()
    library.addItem({ ...itemEntry('fire', "m.cone(0.3, 0.6, { at: [0, 0.3, 0], color: 'orange', glow: true })\nreturn { carry: 'no', solid: true, temp: 'hot' }") })
    const sim = makeSim({ library, room: 'pool' })
    const [alice, steve] = sim.world.actors
    alice!.x = 0
    alice!.z = -3
    run(sim, 1.5)
    expect(hasEffect(alice!, 'wet', sim.world.t)).toBe(true)
    expect(hasEffect(steve!, 'wet', sim.world.t)).toBe(false)
    sim.api.sky.snow = 1
    run(sim, 0.2)
    expect(hasEffect(steve!, 'cold', sim.world.t)).toBe(true)
    sim.api.sky.snow = 0
    sim.api.sky.rain = 1
    run(sim, 0.2)
    expect(hasEffect(steve!, 'wet', sim.world.t)).toBe(true)
    sim.api.sky.rain = 0
    sim.makeItem('fire', { x: steve!.x + 1, z: steve!.z })
    run(sim, 2.5)
    expect(steve!.effects).toBeUndefined()
  })

  it('a dizzy body wobbles its head, a sleepy one nods and looks sleepy, a cold one shivers', () => {
    const sim = makeSim({ actors: 3 })
    const [a, b, c] = sim.api.actors
    a!.effect('dizzy', 5)
    b!.effect('sleepy', 5)
    c!.effect('cold', 5)
    const turns: number[] = []
    const twists: number[] = []
    run(sim, 2, () => {
      turns.push(sim.world.actors[0]!.sway!.turn)
      twists.push(sim.world.actors[2]!.sway!.twist)
    })
    expect(Math.max(...turns) - Math.min(...turns)).toBeGreaterThan(0.4)
    expect(Math.max(...twists) - Math.min(...twists)).toBeGreaterThan(0.05)
    expect(sim.world.actors[1]!.mood).toBe('sleepy')
  })
})
