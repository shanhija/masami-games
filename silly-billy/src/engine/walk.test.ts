/**
 * Walking in the sim (runtime.ts's walkTo over path.ts), each way an avatar got stuck before:
 * left inside another at a thing's edge (Noora and Mirri at the slide's end, 2026-11-08), the
 * forest camp's pocket, a thing against the room's edge, a goal inside a thing, a start inside
 * one, a crowd on one spot, a spot someone stands on, two meeting head on, a long walk the old
 * 12 s cut short. Things here are posts of the rooms' own sizes, so the engine is tested
 * without content/.
 */
import { describe, expect, it } from 'vitest'

import { proportions } from './body'
import { Library, type BuiltinItem } from './library'
import { createWorld, newActor, Sim, type Placement } from './sim'
import { ACTIONS, ITEMS, kidLook, run, runUntil, step } from './testing'
import { ROOM_HALF, STEP, type Actor, type Look, type WorldEvent } from './types'

/** A solid round thing `r` metres across its footprint's widest, tall enough to block anyone. */
const post = (id: string, r: number, seat = false): BuiltinItem => ({
  id,
  name: id,
  nameFi: id,
  calls: [id],
  about: `a solid thing ${r} m round`,
  build: (m) => {
    m.cylinder(r, r, 1.2, { at: [0, 0.6, 0], color: 'grey' })
    if (seat) m.anchor('seat', [0, 0.5, r * 0.5])
    return { carry: 'no', solid: true, sit: seat }
  },
})

/** The rooms' sizes: the slide, the swing (a seat), the forest's fire, logs and stump, a hedge as long as half the room's side. */
const THINGS: BuiltinItem[] = [post('slide', 1.87), post('swing', 1.65, true), post('fire', 0.57), post('log', 0.93), post('stump', 0.63), post('hedge', 3), post('rock1', 1)]

const look = (body: Look['body'], height: number, build = 1): Look => ({ ...kidLook('#ff9ccf'), body, height, build })

/** Who walks: the cast's sizes. */
const PEOPLE: Record<string, Look> = {
  alice: look('kid', 1.15),
  steve: look('kid', 1.22, 1.1),
  mike: look('grownup', 1.8, 1.05),
  noora: look('kid', 1.05, 0.95),
  mirri: look('cat', 0.5, 1.1),
}

/** A sim with these people standing where given, and these things. */
function world(at: Record<string, [number, number]>, things: Placement[] = []): Sim {
  const actors = Object.entries(at).map(([id, [x, z]]) => newActor({ id, name: id, calls: [id], pronoun: 'she', look: PEOPLE[id]!, x, z }))
  const library = new Library({ items: [...ITEMS, ...THINGS], actions: ACTIONS })
  return new Sim(createWorld({ room: 'playground', actors, layouts: { playground: things, pool: [], forest: [] }, seed: 1 }), library)
}

const fixed = (kind: string, x: number, z: number): Placement => ({ kind, x, z, fixed: true })
const actor = (sim: Sim, id: string) => sim.world.actors.find((a) => a.id === id)!
const radius = (a: Actor) => proportions(a.look).radius * a.scale
/** Puts actors where the test wants them (createWorld stood them on the spawn row). */
function stand(sim: Sim, at: Record<string, [number, number]>) {
  for (const [id, [x, z]] of Object.entries(at)) Object.assign(actor(sim, id), { x, z })
}

/** Seconds until each actor's step is over (done or failed), running at most `most` s; Infinity for one still going. */
function timeSteps(sim: Sim, most: number, each: () => void = () => {}): Record<string, number> {
  const over: Record<string, number> = {}
  const t0 = sim.world.t
  for (let i = Math.round(most / STEP); i > 0; i--) {
    sim.step()
    each()
    for (const e of sim.world.events) if (e.type === 'done' || e.type === 'failed') over[e.actor] ??= sim.world.t - t0
    sim.world.events.length = 0
    sim.world.sounds.length = 0
    if (sim.world.actors.every((a) => over[a.id] !== undefined || (a.doing === null && a.queue.length === 0))) break
  }
  for (const a of sim.world.actors) over[a.id] ??= a.doing === null && a.queue.length === 0 ? 0 : Infinity
  return over
}

describe('walking where it got stuck before', () => {
  it('walks out of the cat it was left inside at the slide’s end and sits on the swing (Noora, 2026-11-08)', () => {
    // Both did the made slide and stood on one spot at its end, Noora inside Mirri and a hair
    // outside the slide's circle. Told to swing, she walked on the spot for 12 s, twice.
    const at = { noora: [-6.5, -3.35] as [number, number], mirri: [-6.46, -3.3] as [number, number] }
    const sim = world(at, [fixed('slide', -6.5, -5.5), fixed('swing', 0, -7)])
    stand(sim, at)
    const noora = actor(sim, 'noora')
    const slide = sim.world.items.find((it) => it.kind === 'slide')!
    let closest = Infinity
    sim.give('noora', [step('sit', { thing: 'swing' })], true)
    const events: WorldEvent[] = runUntil(sim, 'done', 'noora', 10, () => {
      if (noora.riding === null) closest = Math.min(closest, Math.hypot(noora.x - slide.x, noora.z - slide.z) - 1.87 - radius(noora))
    })
    expect(events.some((e) => e.type === 'failed')).toBe(false)
    expect(noora.riding).toBe(sim.world.items.find((it) => it.kind === 'swing')!.id)
    expect(closest).toBeGreaterThan(-0.01)
    // About 7 m at 1.5 m/s, and the hop on.
    expect(sim.world.t).toBeLessThan(7)
  })

  it('walks round the forest camp, not into the pocket between the fire and its logs', () => {
    const at = { mike: [-5.94, -4.39] as [number, number] }
    const sim = world(at, [fixed('fire', -2.2, -3.6), fixed('log', -2.2, -5.6), fixed('log', -4.4, -3.2), fixed('stump', -3, -1.6)])
    stand(sim, at)
    sim.give('mike', [step('walk', { target: '7.64,-0.76' })], true)
    const t = timeSteps(sim, 20)
    const mike = actor(sim, 'mike')
    expect(Math.hypot(mike.x - 7.64, mike.z + 0.76)).toBeLessThan(0.15)
    // 14 m at 1.7 m/s, and round the camp.
    expect(t.mike).toBeLessThan(11)
  })

  it('goes round a thing that touches the room’s edge to a spot behind it', () => {
    // A hedge 3 m round at the right edge: along the edge there is no way past it.
    const at = { alice: [11, 6] as [number, number] }
    const sim = world(at, [fixed('hedge', 9.5, 0)])
    stand(sim, at)
    sim.give('alice', [step('walk', { target: '11,-6' })], true)
    const t = timeSteps(sim, 25)
    const alice = actor(sim, 'alice')
    expect(Math.hypot(alice.x - 11, alice.z + 6)).toBeLessThan(0.15)
    expect(t.alice).toBeLessThan(16)
  })

  it('walks up to a thing whose middle it was sent to and stops there, not pushing on', () => {
    const at = { steve: [5, 0] as [number, number] }
    const sim = world(at, [fixed('rock1', 0, 0)])
    stand(sim, at)
    sim.give('steve', [step('walk', { target: '0,0' })], true)
    const t = timeSteps(sim, 15)
    const steve = actor(sim, 'steve')
    expect(Math.hypot(steve.x, steve.z)).toBeLessThan(1 + radius(steve) + 0.1)
    // 3.7 m at 1.5 m/s: no seconds of pushing at the end.
    expect(t.steve).toBeLessThan(3.2)
  })

  it('walks out of a thing it was put inside, by the near side, to either side', () => {
    for (const target of ['5,0', '-5,0']) {
      const at = { alice: [0.4, 0.1] as [number, number] }
      const sim = world(at, [fixed('rock1', 0, 0)])
      stand(sim, at)
      sim.give('alice', [step('walk', { target })], true)
      const t = timeSteps(sim, 15)
      const alice = actor(sim, 'alice')
      expect(Math.hypot(alice.x - Number(target.split(',')[0]), alice.z)).toBeLessThan(0.15)
      expect(t.alice).toBeLessThan(target === '5,0' ? 4 : 8)
    }
  })

  it('walks a long way across the room to the end (the old walk gave up after 12 s)', () => {
    const at = { noora: [-11, -11] as [number, number] }
    const sim = world(at)
    stand(sim, at)
    sim.give('noora', [step('walk', { target: '11,11' })], true)
    const t = timeSteps(sim, 40)
    const noora = actor(sim, 'noora')
    expect(Math.hypot(noora.x - 11, noora.z - 11)).toBeLessThan(0.15)
    expect(t.noora).toBeGreaterThan(12)
    expect(t.noora).toBeLessThan(25)
  })
})

describe('walking among others', () => {
  it('a crowd on one spot: each stops beside the others within moments', () => {
    const at: Record<string, [number, number]> = { alice: [-4, 0], steve: [4, 0], mike: [0, -4], noora: [0, 4], mirri: [3, 3] }
    const sim = world(at)
    stand(sim, at)
    for (const id of Object.keys(at)) sim.give(id, [step('walk', { target: '0,0' })], true)
    const t = timeSteps(sim, 15)
    for (const a of sim.world.actors) {
      // About 3 m at 1.5 m/s to the crowd, then at most a moment's wait.
      expect(t[a.id]).toBeLessThan(4.5)
      expect(Math.hypot(a.x, a.z)).toBeLessThan(1.2)
    }
  })

  it('a spot someone stands on: stops beside them, or goes round to a nearer side', () => {
    const at: Record<string, [number, number]> = { mike: [0.2, 7.1], alice: [-3, 4] }
    const sim = world(at)
    stand(sim, at)
    sim.give('alice', [step('walk', { target: '0,7.2' })], true)
    const t = timeSteps(sim, 15)
    const alice = actor(sim, 'alice')
    const mike = actor(sim, 'mike')
    expect(t.alice).toBeLessThan(4)
    expect(Math.hypot(alice.x - mike.x, alice.z - mike.z)).toBeLessThan(radius(alice) + radius(mike) + 0.1)
  })

  it('two meeting head on step round each other and both get there', () => {
    const at: Record<string, [number, number]> = { alice: [-4, 0], steve: [4, 0] }
    const sim = world(at)
    stand(sim, at)
    sim.give('alice', [step('walk', { target: '4,0' })], true)
    sim.give('steve', [step('walk', { target: '-4,0' })], true)
    let least = Infinity
    const alice = actor(sim, 'alice')
    const steve = actor(sim, 'steve')
    const t = timeSteps(sim, 15, () => {
      least = Math.min(least, Math.hypot(alice.x - steve.x, alice.z - steve.z))
    })
    expect(Math.hypot(alice.x - 4, alice.z)).toBeLessThan(0.15)
    expect(Math.hypot(steve.x + 4, steve.z)).toBeLessThan(0.15)
    expect(t.alice).toBeLessThan(7.5)
    expect(t.steve).toBeLessThan(7.5)
    expect(least).toBeGreaterThan(radius(alice) + radius(steve) - 0.01)
  })

  it('keeps everyone inside the room and out of things while many walk at once', () => {
    const at: Record<string, [number, number]> = { alice: [-6, 6], steve: [6, 6], mike: [0, 9], noora: [-9, 0], mirri: [9, -1] }
    const sim = world(at, [fixed('slide', -6.5, -5.5), fixed('swing', 0, -7), fixed('fire', 4, -2), fixed('log', 6, -4), fixed('hedge', 9, 9)])
    stand(sim, at)
    const solids = sim.world.items.map((it) => ({ x: it.x, z: it.z, r: sim.library.info(it.kind).radius }))
    const targets = ['-6.5,-9', '0,-10', '6,-6', '-10,-6', '3,-4']
    Object.keys(at).forEach((id, k) => sim.give(id, [step('walk', { target: targets[k]! })], true))
    const t = timeSteps(sim, 30, () => {
      for (const a of sim.world.actors) {
        expect(Math.abs(a.x)).toBeLessThanOrEqual(ROOM_HALF)
        expect(Math.abs(a.z)).toBeLessThanOrEqual(ROOM_HALF)
        for (const s of solids) expect(Math.hypot(a.x - s.x, a.z - s.z)).toBeGreaterThan(s.r + radius(a) - 0.01)
      }
    })
    for (const id of Object.keys(at)) expect(t[id]).toBeLessThan(20)
    // Everyone is done: nobody walks on the spot.
    run(sim, 0.5)
    expect(sim.world.actors.every((a) => a.doing === null)).toBe(true)
  })
})
