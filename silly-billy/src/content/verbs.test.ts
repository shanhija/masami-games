/**
 * Every basic verb, run to done on the real Sim by every cast member in every room, with the
 * args a child's command would give it; then the world is checked: what the verb was for
 * happened, nothing failed, and every number is finite and inside the room.
 */

import { describe, expect, it } from 'vitest'

import { parseColor } from '../engine/kit'
import { Library } from '../engine/library'
import { Sim, createWorld } from '../engine/sim'
import { ROOMS, ROOM_HALF, type Actor, type RoomId, type Step, type World } from '../engine/types'
import { BASIC_VERBS, BUILTIN_ACTIONS, BUILTIN_ITEMS, CAST, LAYOUTS, makeCast } from '.'

const library = new Library({ items: BUILTIN_ITEMS, actions: BUILTIN_ACTIONS })

/** In each room: a little thing to carry, something to sit on, something big to look at, and something there is more than one of to make vanish. */
const THINGS: Record<RoomId, { small: string; seat: string; big: string; gone: string }> = {
  playground: { small: 'ball', seat: 'bench', big: 'slide', gone: 'flowers' },
  pool: { small: 'beach-ball', seat: 'lounger', big: 'diving-board', gone: 'rubber-duck' },
  forest: { small: 'pinecone', seat: 'log', big: 'tent', gone: 'stick' },
}

type Plan = { action: string; args: Record<string, string> }[]
type Ran = { start: World; world: World; me: Actor; other: Actor }

/** What a child would say for each verb, and what must be true once it is done. */
const VERBS: Record<string, { steps: (t: (typeof THINGS)[RoomId], other: string) => Plan; check?: (r: Ran, t: (typeof THINGS)[RoomId]) => void }> = {
  walk: {
    steps: () => [{ action: 'walk', args: { to: '3,-2' } }],
    check: ({ me }) => expect(Math.hypot(me.x - 3, me.z + 2)).toBeLessThan(1.2),
  },
  run: { steps: (t) => [{ action: 'run', args: { to: t.big } }] },
  come: {
    steps: () => [{ action: 'come', args: {} }],
    check: ({ me }) => expect(me.z).toBeGreaterThan(6.3),
  },
  'pick-up': {
    steps: (t) => [{ action: 'pick-up', args: { thing: t.small } }],
    check: ({ world, me }, t) => expect(held(world, me)).toContain(t.small),
  },
  drop: {
    steps: (t) => [
      { action: 'pick-up', args: { thing: t.small } },
      { action: 'drop', args: { thing: t.small } },
    ],
    check: ({ world, me }) => expect(held(world, me)).toEqual([]),
  },
  give: {
    steps: (t, other) => [{ action: 'give', args: { thing: t.small, to: other } }],
    check: ({ world, me, other }, t) => {
      expect(held(world, other)).toContain(t.small)
      expect(held(world, me)).toEqual([])
    },
  },
  jump: { steps: () => [{ action: 'jump', args: { times: '2' } }] },
  wave: { steps: (_, other) => [{ action: 'wave', args: { to: other } }] },
  sit: {
    steps: (t) => [{ action: 'sit', args: { on: t.seat } }],
    check: ({ world, me }, t) => expect(world.items.find((it) => it.id === me.riding)?.kind).toBe(t.seat),
  },
  sleep: {
    steps: () => [{ action: 'sleep', args: {} }],
    check: ({ me }) => expect(Math.max(Math.abs(me.pitch), Math.abs(me.roll))).toBeGreaterThan(0.6),
  },
  spin: { steps: () => [{ action: 'spin', args: {} }] },
  say: {
    steps: () => [{ action: 'say', args: { words: 'hello' } }],
    check: ({ me }) => expect(me.bubble?.text).toBe('hello'),
  },
  follow: { steps: (_, other) => [{ action: 'follow', args: { who: other } }] },
  look: { steps: (t) => [{ action: 'look', args: { at: t.big } }] },
  make: {
    steps: () => [{ action: 'make', args: { thing: 'ball', color: 'sininen' } }],
    check: ({ start, world }) => {
      const balls = world.items.filter((it) => it.kind === 'ball' && !start.items.some((s) => s.id === it.id))
      expect(balls.map((b) => b.tint)).toEqual([parseColor('blue')])
    },
  },
  remove: {
    steps: (t) => [{ action: 'remove', args: { thing: t.gone } }],
    check: ({ start, world }, t) => expect(count(world, t.gone)).toBe(count(start, t.gone) - 1),
  },
  wear: {
    steps: () => [{ action: 'wear', args: { thing: 'cap', color: 'pink' } }],
    check: ({ me }) => expect(me.look.worn.head).toEqual({ kind: 'cap', tint: parseColor('pink') }),
  },
  'take-off': {
    steps: () => [
      { action: 'wear', args: { thing: 'glasses' } },
      { action: 'take-off', args: { thing: 'glasses' } },
    ],
    check: ({ me }) => expect(me.look.worn.face).toBeUndefined(),
  },
  paint: {
    steps: (_, other) => [{ action: 'paint', args: { color: 'punaiseksi', thing: other, part: 'paita' } }],
    check: ({ other }) => expect(other.look.top).toBe(parseColor('red')),
  },
  grow: {
    steps: () => [{ action: 'grow', args: {} }],
    check: ({ me }) => expect(me.scale).toBeCloseTo(1.5),
  },
  shrink: {
    steps: () => [{ action: 'shrink', args: {} }],
    check: ({ me }) => expect(me.scale).toBeCloseTo(1 / 1.5),
  },
  rename: {
    steps: () => [{ action: 'rename', args: { name: 'pupu' } }],
    check: ({ me }) => expect(me.name).toBe('Pupu'),
  },
}

const held = (w: World, a: Actor) => [...new Set([a.hands.right, a.hands.left])].flatMap((id) => w.items.filter((it) => it.id === id).map((it) => it.kind))
const count = (w: World, kind: string) => w.items.filter((it) => it.kind === kind).length

/** Every number anywhere in the world that is not finite, by its path. */
function badNumbers(v: unknown, path: string, out: string[]): string[] {
  if (typeof v === 'number' && !Number.isFinite(v)) out.push(path)
  else if (v !== null && typeof v === 'object') for (const [k, x] of Object.entries(v)) badNumbers(x, `${path}.${k}`, out)
  return out
}

/** Gives the steps to one actor in a fresh world and steps the sim until they have all ended. */
function run(room: RoomId, who: string, plan: Plan): Ran & { ended: { type: string; action: string; error: string | null }[]; secs: number } {
  const sim = new Sim(createWorld({ room, actors: makeCast(), layouts: LAYOUTS, seed: 7 }), library)
  const start = structuredClone(sim.world)
  const steps: Step[] = plan.map((s, i) => ({ ...s, serial: i + 1 }))
  sim.give(who, steps, true)
  const ended: { type: string; action: string; error: string | null }[] = []
  let frames = 0
  while (ended.length < steps.length && frames < 60 * 90) {
    sim.step()
    frames++
    for (const e of sim.world.events) if ((e.type === 'done' || e.type === 'failed') && e.actor === who) ended.push({ type: e.type, action: e.step.action, error: e.type === 'failed' ? e.error : null })
    sim.world.events.length = 0
    sim.world.sounds.length = 0
    sim.world.speech.length = 0
  }
  const world = sim.world
  const me = world.actors.find((a) => a.id === who)!
  const other = world.actors.find((a) => a.id !== who && a.id === (who === 'alice' ? 'steve' : 'alice'))!
  return { start, world, me, other, ended, secs: frames / 60 }
}

describe('every basic verb', () => {
  it('has a command to try it with', () => {
    expect(Object.keys(VERBS)).toEqual(BASIC_VERBS.map((a) => a.id))
  })

  for (const room of ROOMS) {
    describe(room, () => {
      for (const [verb, { steps, check }] of Object.entries(VERBS)) {
        it(`${verb}: everyone does it to the end`, () => {
          for (const c of CAST) {
            const other = c.id === 'alice' ? 'steve' : 'alice'
            const plan = steps(THINGS[room], other)
            const r = run(room, c.id, plan)
            const label = `${c.id} ${verb} in the ${room}`
            expect(r.ended, label).toEqual(plan.map((s) => ({ type: 'done', action: s.action, error: null })))
            expect(r.secs, label).toBeLessThan(40)
            expect(badNumbers(r.world, 'world', []), label).toEqual([])
            for (const t of [...r.world.actors, ...r.world.items]) {
              expect(Math.abs(t.x), `${label}: ${t.id}`).toBeLessThanOrEqual(ROOM_HALF)
              expect(Math.abs(t.z), `${label}: ${t.id}`).toBeLessThanOrEqual(ROOM_HALF)
            }
            if (check) {
              try {
                check(r, THINGS[room])
              } catch (e) {
                throw new Error(`${label}: ${(e as Error).message}`)
              }
            }
          }
        })
      }
    })
  }

  it('understands the words a child uses for parts of a person', () => {
    const bald = run('playground', 'alice', [{ action: 'take-off', args: { thing: 'tukka' } }])
    expect(bald.me.look.worn.hair).toBeUndefined()
    expect(bald.world.items.some((it) => it.kind === 'hair-ponytail')).toBe(true)
    const blue = run('playground', 'noora', [{ action: 'paint', args: { color: 'sininen', part: 'hiukset' } }])
    expect(blue.me.look.worn.hair?.tint).toBe(parseColor('blue'))
    const shoes = run('forest', 'steve', [{ action: 'paint', args: { color: 'keltaiseksi', thing: 'mike', part: 'kengät' } }])
    expect(shoes.world.actors.find((a) => a.id === 'mike')!.look.shoes).toBe(parseColor('yellow'))
  })

  it('leaves a sitter sitting and a sleeper lying until the next command gets them up', () => {
    const sat = run('playground', 'noora', [{ action: 'sit', args: { on: 'bench' } }])
    expect(sat.me.riding).not.toBeNull()
    const after = run('playground', 'noora', [
      { action: 'sit', args: { on: 'bench' } },
      { action: 'wave', args: {} },
    ])
    expect(after.me.riding).toBeNull()
    const woke = run('forest', 'mike', [
      { action: 'sleep', args: {} },
      { action: 'come', args: {} },
    ])
    expect(Math.abs(woke.me.pitch)).toBeLessThan(0.05)
    expect(woke.me.z).toBeGreaterThan(6.3)
  })

  it('leaves the cat sitting on the ground too, though her body is lowered only a little', () => {
    const sim = new Sim(createWorld({ room: 'playground', actors: makeCast(), layouts: LAYOUTS, seed: 7 }), library)
    const mirri = sim.world.actors.find((a) => a.id === 'mirri')!
    sim.give('mirri', [{ action: 'sit', args: {}, serial: 1 }], true)
    let done = false
    for (let f = 0; f < 60 * 8 && !done; f++) {
      sim.step()
      done = sim.world.events.some((e) => e.type === 'done' && e.actor === 'mirri')
      sim.world.events.length = 0
    }
    expect(done).toBe(true)
    const sat = mirri.pose.bob
    for (let f = 0; f < 120; f++) sim.step()
    // Still down two seconds later (breathing aside), her back legs folded.
    expect(sat).toBeLessThan(-0.04)
    expect(mirri.pose.bob).toBeLessThan(-0.04)
    expect(mirri.pose.legL.bend).toBeGreaterThan(1.2)
  })

  it('says the words aloud as well as in a bubble', () => {
    const sim = new Sim(createWorld({ room: 'playground', actors: makeCast(), layouts: LAYOUTS, seed: 7 }), library)
    sim.give('alice', [{ action: 'say', args: { words: 'hei kaikille' }, serial: 1 }], true)
    const said: string[] = []
    for (let f = 0; f < 60 * 3; f++) {
      sim.step()
      said.push(...sim.world.speech.map((s) => `${s.actor}: ${s.text}`))
      sim.world.speech.length = 0
    }
    expect(said).toEqual(['alice: hei kaikille'])
  })
})
