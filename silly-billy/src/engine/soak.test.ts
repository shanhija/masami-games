/**
 * A random child at the screen for five simulated minutes, giving any actor any step with any
 * words (made actions that work, throw, loop forever or write nonsense among them), switching
 * rooms, stopping, making and removing things. Nothing may throw, and every number must stay
 * finite and inside the room. Then a busy room on the clock, loosely.
 */
import { describe, expect, it } from 'vitest'

import { createWorld, newActor, Sim, type Placement, type Reaction } from './sim'
import { actionEntry, CAST, kidLook, newLibrary, step } from './testing'
import { ROOM_HALF, ROOMS, SLOTS, type Look, type World } from './types'

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const MADE = [
  actionEntry('dance', [], "__g();me.feel('silly')\nfor (let i = 0; i < 40; i++) {__g();\n  me.yaw += 0.25\n  me.pose.armL.swing = Math.sin(i / 3) * 2\n  if (i % 10 === 0) { w.puff({ at: me, kind: 'notes', count: 4 }); w.sound('cheer') }\n  yield\n}\nyield* me.rest()"),
  actionEntry('boom', [], '__g();yield* w.wait(0.3)\nnull.x = 1'),
  actionEntry('loop', [], 'while (true) {__g(); }'),
  actionEntry(
    'chaos',
    [{ name: 'thing', kind: 'item', about: '', optional: true }],
    [
      "__g();const t = args.thing || w.find('ball')",
      'me.pose.lean = NaN; me.pose.armR = 7; me.scale = 1e9; me.look.top = 42; me.look.worn = 5',
      "const u = w.make('unicorn', { y: 3 })",
      'u.state.x = NaN; u.vx = Infinity; u.y = -1e9',
      'if (t) { t.y = 6; t.x = NaN; t.part("frame").rx = 1e12; t.tint = "sparkly"; t.scale = 0 }',
      'yield* w.wait(0.6)',
      "const b = w.find('ball', { not: t })",
      'if (b) w.launch(b, 30, 40, -30)',
      "if (w.random() < 0.5) { const h = w.find('hat'); if (h) me.wear(h, 'face') } else me.takeOff('face')",
      'if (w.random() < 0.3 && u) w.remove(u)',
      'yield',
    ].join('\n'),
  ),
  actionEntry(
    'party',
    [{ name: 'friend', kind: 'actor', about: '', optional: true }],
    [
      "__g();const f = args.friend || w.pick(w.actors.filter((a) => a !== me))",
      'if (!f) return',
      'w.join(f)',
      'yield* w.together(me.walkTo(f, { near: 0.3 }), f.turnTo(me))',
      "const bike = w.find('bike', { free: true })",
      'if (bike) { yield* me.ride(bike); yield* w.during(1, (k) => { bike.x += 0.03; bike.yaw += 0.05; bike.part("wheelFront").rx += 0.3 }) }',
      'yield* f.tumble()',
      'yield* w.until(() => !f.busy, 1)',
      'yield* f.jump(0.5, 1)',
      'f.say("Wheee!")',
    ].join('\n'),
  ),
  actionEntry('yieldy', [], '__g();yield me.jump(0.3)\nyield w.wait(0.2)\nyield me.walkTo(me.ahead(2))\nyield 5'),
]

const KINDS = ['ball', 'box', 'bench', 'bike', 'rock', 'hat', 'pallo', 'laatikko', 'hattu', 'zebra', '', '#i3', '#i999']
const WORDS = ['alice', 'stive', 'mike', 'noora', 'kissa', 'dad', 'nobody', '3,4', '-11,11', '100,-100', 'ball', '', 'x,y']
const ACTIONS = ['walk', 'pick-up', 'drop', 'throw', 'jump', 'ride', 'sit', 'wear', 'take-off', 'dance', 'boom', 'loop', 'chaos', 'party', 'yieldy', 'mystery-move']
const REACTIONS: Reaction[] = ['shrug', 'yay', 'huh', 'hello', 'think']

function layouts(): Record<'playground' | 'pool' | 'forest', Placement[]> {
  return {
    playground: [
      { kind: 'rock', x: -6, z: -3, fixed: true },
      { kind: 'rock', x: 5, z: -6, fixed: true },
      { kind: 'bench', x: 0, z: -8, fixed: true },
      { kind: 'bench', x: -8, z: 1, fixed: true, yaw: 1.5 },
      { kind: 'ball', x: 1, z: 0 },
      { kind: 'ball', x: -2, z: -1 },
      { kind: 'ball', x: 6, z: 1 },
      { kind: 'box', x: 3, z: -2 },
      { kind: 'bike', x: -4, z: -6 },
      { kind: 'bike', x: 8, z: -2 },
      { kind: 'hat', x: 2, z: 2 },
      { kind: 'hat', x: -1, z: -5 },
    ],
    pool: [
      { kind: 'ball', x: 0, z: -3 },
      { kind: 'ball', x: 3, z: -1 },
      { kind: 'bench', x: 8, z: 0, fixed: true },
      { kind: 'hat', x: -8, z: 3 },
      { kind: 'box', x: 7, z: -8 },
    ],
    forest: [
      { kind: 'rock', x: -3, z: -3, fixed: true },
      { kind: 'rock', x: 2, z: -6, fixed: true },
      { kind: 'ball', x: 4, z: 0 },
      { kind: 'bike', x: -6, z: 2 },
    ],
  }
}

/** Throws with the reason when a number of the world is not finite or not in the room. */
function check(w: World) {
  const fail = (why: string) => {
    throw new Error(`at ${w.t.toFixed(2)} s in the ${w.room}: ${why}`)
  }
  const finite = (what: string, v: unknown) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${what} is ${String(v)}`)
  }
  const inside = (what: string, x: number, y: number, z: number) => {
    finite(`${what} x`, x)
    finite(`${what} y`, y)
    finite(`${what} z`, z)
    if (Math.abs(x) > ROOM_HALF || Math.abs(z) > ROOM_HALF || y < -2 || y > 30) fail(`${what} is out of the room at ${x}, ${y}, ${z}`)
  }
  for (const a of w.actors) {
    inside(a.id, a.x, a.y, a.z)
    for (const k of ['yaw', 'pitch', 'roll', 'scale', 'stride', 'speed'] as const) finite(`${a.id} ${k}`, a[k])
    if (a.scale < 0.2 || a.scale > 4) fail(`${a.id} scale ${a.scale}`)
    const p = a.pose
    for (const k of ['lean', 'tilt', 'twist', 'bob', 'squash', 'tail'] as const) finite(`${a.id} pose ${k}`, p[k])
    for (const k of ['nod', 'turn', 'tilt'] as const) finite(`${a.id} head ${k}`, p.head[k])
    for (const limb of [p.armL, p.armR, p.legL, p.legR]) for (const k of ['swing', 'raise', 'bend'] as const) finite(`${a.id} limb ${k}`, limb[k])
    for (const hand of ['left', 'right'] as const) {
      const id = a.hands[hand]
      if (id !== null && w.items.find((it) => it.id === id)?.holder?.actor !== a.id) fail(`${a.id} holds ${id}, which is not held by it`)
    }
    if (a.riding !== null && w.items.find((it) => it.id === a.riding)?.rider !== a.id) fail(`${a.id} rides ${a.riding}, which it is not on`)
    for (const k of ['skin', 'eyes', 'top', 'bottom', 'shoes'] as const) if (!/^#[0-9a-f]{6}$/.test(a.look[k])) fail(`${a.id} ${k} is ${a.look[k]}`)
    for (const slot of Object.keys(a.look.worn)) if (!SLOTS.includes(slot as never)) fail(`${a.id} wears something on ${slot}`)
  }
  for (const it of w.items) {
    inside(it.id, it.x, it.y, it.z)
    for (const k of ['yaw', 'pitch', 'roll', 'scale', 'vx', 'vy', 'vz', 'spin'] as const) finite(`${it.id} ${k}`, it[k])
    for (const [name, p] of Object.entries(it.parts)) for (const v of Object.values(p)) finite(`${it.id} part ${name}`, v)
    for (const [k, v] of Object.entries(it.state)) finite(`${it.id} state ${k}`, v)
  }
  if (w.puffs.length > 600) fail(`${w.puffs.length} puffs`)
  for (const p of w.puffs) for (const k of ['x', 'y', 'z', 'vx', 'vy', 'vz', 'size'] as const) finite(`a puff's ${k}`, p[k])
}

describe('a random child', () => {
  it('gives random steps for five minutes: nothing throws, every number stays finite and inside the room', () => {
    const r = rng(7)
    const pick = <T,>(list: readonly T[]): T => list[Math.floor(r() * list.length)]!
    const cat: Look = { ...kidLook('#f5a13b'), body: 'cat', height: 0.5, skin: '#f5a13b' }
    const dad: Look = { ...kidLook('#5ec25a'), body: 'grownup', height: 1.6 }
    const actors = [
      ...CAST.slice(0, 4).map((c) => newActor({ id: c.id, name: c.name, calls: [c.id], pronoun: 'she', look: kidLook(c.top), x: 0, z: 0 })),
      newActor({ id: 'mirri', name: 'Mirri', calls: ['kissa'], pronoun: 'it', look: cat, x: 0, z: 0 }),
      newActor({ id: 'dad', name: 'Dad', calls: ['isi'], pronoun: 'he', look: dad, x: 0, z: 0 }),
    ]
    const lib = newLibrary()
    for (const e of MADE) expect(lib.addAction(e)).toEqual({ ok: true })
    const sim = new Sim(createWorld({ room: 'playground', actors, layouts: layouts(), seed: 11 }), lib)
    const counts: Record<string, number> = {}
    let next = 0
    const randomArgs = (action: string): Record<string, string> => {
      switch (action) {
        case 'walk':
          return { target: r() < 0.6 ? `${(r() * 30 - 15).toFixed(1)},${(r() * 30 - 15).toFixed(1)}` : pick(WORDS) }
        case 'pick-up':
        case 'ride':
        case 'wear':
        case 'chaos':
          return { thing: pick(KINDS) }
        case 'sit':
          return r() < 0.5 ? {} : { thing: pick(KINDS) }
        case 'throw':
          return { thing: pick(KINDS), target: pick([...WORDS, ...KINDS]) }
        case 'take-off':
          return { slot: pick([...SLOTS, 'nose']) }
        case 'party':
          return { friend: pick(WORDS) }
        default:
          return r() < 0.2 ? { junk: pick(WORDS) } : {}
      }
    }
    for (let frame = 0; frame < 5 * 60 * 60; frame++) {
      const w = sim.world
      if (w.t >= next) {
        next = w.t + 0.2 + r() * 1.8
        const who = pick(w.actors).id
        const roll = r()
        if (roll < 0.7) {
          const steps = Array.from({ length: 1 + Math.floor(r() * 3) }, () => {
            const action = pick(ACTIONS)
            return step(action, randomArgs(action))
          })
          sim.give(who, steps, r() < 0.6)
        } else if (roll < 0.75) sim.stop(who)
        else if (roll < 0.8) sim.react(who, pick(REACTIONS))
        else if (roll < 0.83) sim.enterRoom(pick(ROOMS))
        else if (roll < 0.86) for (const a of w.actors) sim.dropSteps(a.id, 'mystery-move')
        else if (roll < 0.9) {
          const a = w.actors.find((x) => x.id === who)!
          a.listening = !a.listening
        } else if (roll < 0.94) sim.makeItem(pick(['ball', 'box', 'hat', 'bike', 'unicorn']), { x: r() * 30 - 15, z: r() * 30 - 15, y: r() < 0.5 ? r() * 4 : undefined })
        else if (roll < 0.96 && w.items.length > 0) sim.removeItem(pick(w.items).id)
        else if (roll < 0.98) sim.refreshKind(pick(['ball', 'bike', 'hat']))
        else if (w.actors.some((a) => a.id === 'ella')) sim.removeActor('ella')
        else sim.addActor(newActor({ id: 'ella', name: 'Ella', calls: ['ella'], pronoun: 'she', look: kidLook('#ff5fae'), x: r() * 10 - 5, z: 3 }))
      }
      sim.step()
      check(sim.world)
      for (const e of sim.world.events) counts[e.type] = (counts[e.type] ?? 0) + 1
      sim.world.events.length = 0
      sim.world.sounds.length = 0
      sim.world.speech.length = 0
    }
    expect(counts.started).toBeGreaterThan(200)
    expect(counts.done).toBeGreaterThan(150)
    expect(counts.failed).toBeGreaterThan(10)
    expect(structuredClone(sim.world)).toEqual(sim.world)
    expect(JSON.parse(JSON.stringify(sim.world)).actors.length).toBe(sim.world.actors.length)
  }, 60_000)
})

describe('speed', () => {
  /**
   * On the clock, so only a real slowdown may break it: a busy machine building the image must
   * not stop every game's deploy. The target is under a millisecond a frame (0.3 on the laptop);
   * SILLY_PERF=1 asks for that and prints the time.
   */
  const strict = Boolean(process.env.SILLY_PERF)
  it('steps 6 actors and 80 things well within a frame', () => {
    const r = rng(3)
    const kinds = ['ball', 'box', 'bench', 'rock', 'bike', 'hat', 'ball', 'box']
    const things: Placement[] = Array.from({ length: 80 }, (_, i) => ({
      kind: kinds[i % kinds.length]!,
      x: -10 + (i % 10) * 2.2,
      z: -10 + Math.floor(i / 10) * 2,
      fixed: kinds[i % kinds.length] === 'bench' || kinds[i % kinds.length] === 'rock',
    }))
    const actors = CAST.map((c) => newActor({ id: c.id, name: c.name, calls: [c.id], pronoun: 'she', look: kidLook(c.top), x: 0, z: 0 }))
    const sim = new Sim(createWorld({ room: 'playground', actors, layouts: { playground: things, pool: [], forest: [] }, seed: 5 }), newLibrary())
    expect(sim.world.items.length).toBe(80)
    const busy = () => {
      for (const a of sim.world.actors) {
        if (a.queue.length > 0 || a.doing !== null) continue
        const roll = r()
        const s =
          roll < 0.5
            ? step('walk', { target: `${(r() * 22 - 11).toFixed(1)},${(r() * 22 - 11).toFixed(1)}` })
            : roll < 0.7
              ? step('jump')
              : roll < 0.85
                ? step('pick-up', { thing: 'ball' })
                : step('throw', { thing: 'ball', target: 'steve' })
        sim.give(a.id, [s], false)
      }
    }
    for (let i = 0; i < 300; i++) {
      busy()
      sim.step()
    }
    const frames = 1200
    const start = performance.now()
    for (let i = 0; i < frames; i++) {
      busy()
      sim.step()
      sim.world.events.length = 0
      sim.world.sounds.length = 0
    }
    const ms = (performance.now() - start) / frames
    if (strict) console.info(`the sim takes ${ms.toFixed(3)} ms a frame`)
    expect(ms).toBeLessThan(strict ? 1 : 10)
  })
})
