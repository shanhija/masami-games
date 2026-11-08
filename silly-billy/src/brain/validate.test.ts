/**
 * Testing made code before it is taken in: actions that end, throw, never yield or keep going;
 * things too big, too small, empty or with a broken process; and the worker around it all,
 * which answers, hangs or cannot start. Needs the engine's Sim and the content.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { LAYOUTS, makeCast } from '../content'
import type { ActionEntry, ItemEntry } from '../engine/protocol'
import { createWorld } from '../engine/sim'
import type { World } from '../engine/types'
import { actionEntry, itemEntry } from './testing'
import { snapshotOf, validate, validateInWorker, type ValidateRequest, type ValidateResult } from './validate'

const world = createWorld({ room: 'playground', actors: makeCast(), layouts: LAYOUTS, seed: 3 })
const tryAction = (entry: ActionEntry, args: Record<string, string> = {}, items: ItemEntry[] = []): ValidateResult =>
  validate({ snapshot: world, entries: { items, actions: [] }, candidate: { kind: 'action', entry, actor: world.actors[0]!.id, args } })
const tryItem = (entry: ItemEntry): ValidateResult => validate({ snapshot: world, entries: { items: [], actions: [] }, candidate: { kind: 'item', entry } })

describe('validating an action', () => {
  it('passes one that ends, and says how long it took', () => {
    const r = tryAction(actionEntry('hop', "me.say('Hop!')\nyield* me.jump(0.5)\nyield* me.rest()"))
    expect(r.error).toBeNull()
    expect(r.ok).toBe(true)
    expect(r.notes.join(' ')).toMatch(/done after \d+\.\d s/)
  })

  it('passes lines in both languages and plain ones, played in the world’s language with its names', () => {
    for (const [lang, me, ball] of [['fi', 'Aino', 'pallo'], ['en', 'Alice', 'ball']] as const) {
      const snapshot = createWorld({ room: 'playground', actors: makeCast(lang), layouts: LAYOUTS, seed: 3, lang })
      const code = [
        "me.say({ en: 'Wheee!', fi: 'Jee!' })",
        'yield',
        "me.say(me.name + '!')",
        `if (me.name !== '${me}') throw new Error('called ' + me.name)`,
        `if (w.find('ball').name !== '${ball}') throw new Error('the ball is a ' + w.find('ball').name)`,
        'yield* me.jump(0.4)',
        "me.speak({ en: 'Bye!', fi: 'Heippa!' })",
        "me.say('Pupu')",
        'yield',
      ].join('\n')
      const r = validate({ snapshot, entries: { items: [], actions: [] }, candidate: { kind: 'action', entry: actionEntry('cheer', code), actor: 'alice', args: {} } })
      expect(r.error, lang).toBeNull()
      expect(r.ok, lang).toBe(true)
    }
  })

  it('keeps the world’s language in the copy it tests on, Finnish for a world that has none', () => {
    expect(snapshotOf(createWorld({ room: 'playground', actors: makeCast('fi'), layouts: LAYOUTS, seed: 3, lang: 'fi' })).lang).toBe('fi')
    expect(snapshotOf(world).lang).toBe('en')
    const { lang: _, ...old } = world
    expect(snapshotOf(old as World).lang).toBe('fi')
  })

  it('fails one that throws, with the error and its line', () => {
    const r = tryAction(actionEntry('oops', 'yield\nyield\nthrow new Error("boom")'))
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/boom/)
    expect(r.error).toMatch(/line 3/)
  })

  it('fails a loop that never yields', () => {
    const r = validate({
      snapshot: world,
      entries: { items: [], actions: [] },
      candidate: { kind: 'action', entry: { ...actionEntry('stuck', 'while (true) {}'), guarded: 'function* __action(me, args, w) {__g();\nwhile (true) {__g();}\n}' }, actor: world.actors[0]!.id, args: {} },
    })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/too long/)
  })

  it('passes one still going after 20 s', () => {
    const r = tryAction(actionEntry('forever', 'while (true) yield'))
    expect(r.ok).toBe(true)
    expect(r.notes).toContain('still going after 20 s')
  })

  it('plays it with the args of the step that asked for it', () => {
    const thing = { name: 'thing', kind: 'item' as const, about: 'what to kick', optional: false }
    const r = tryAction(actionEntry('kick', "const b = args.thing\nif (!b || b.kind !== 'ball') throw new Error('no ball')\nyield* me.turnTo(b)", [thing]), { thing: 'ball' })
    expect(r.error).toBeNull()
  })

  it('plays it again with its optional args left out, as "Steve, aja" asks for it', () => {
    const target = { name: 'target', kind: 'thing' as const, about: 'what to ride over', optional: true }
    // Like the made ride in the play test: it reads the target's radius without asking whether there is one.
    const careless = tryAction(actionEntry('ride', 'const r = args.target.radius + 0.5\nyield* me.walkTo(args.target, { near: r })', [target]), { target: 'tree' })
    expect(careless.ok).toBe(false)
    expect(careless.error).toMatch(/^when target is not given: .*radius/)
    const careful = tryAction(actionEntry('ride', 'const t = args.target\nif (t) yield* me.walkTo(t, { near: t.radius + 0.5 })\nyield* me.jump(0.3)', [target]), { target: 'tree' })
    expect(careful.error).toBeNull()
    expect(careful.notes.filter((n) => /done after/.test(n))).toHaveLength(2)
  })

  it('can use a thing that is still only a draft', () => {
    const r = tryAction(actionEntry('toss', "const f = w.find('frisbee') || w.make('frisbee', { near: me })\nyield* me.turnTo(f)\nyield* w.wait(0.2)"), {}, [itemEntry('frisbee', null)])
    expect(r.error).toBeNull()
  })

  it('leaves the world it was given alone', () => {
    const before = JSON.stringify(world)
    tryAction(actionEntry('hop', 'yield* me.jump(0.5)'))
    expect(JSON.stringify(world)).toBe(before)
  })

  it('fails code that does not compile', () => {
    const r = validate({ snapshot: world, entries: { items: [], actions: [] }, candidate: { kind: 'action', entry: { ...actionEntry('bad', 'yield'), guarded: 'function* (me, args, w) { yield ) }' }, actor: world.actors[0]!.id, args: {} } })
    expect(r.ok).toBe(false)
  })
})

describe('validating a thing', () => {
  it('passes one that builds, with what the kit forgave', () => {
    const r = tryItem(itemEntry('frisbee', "m.cylinder(0.15, 0.15, 0.04, { at: [0, 0.02, 0], color: 'sparkly' })\nreturn { carry: 'hand', bouncy: 0.4 }"))
    expect(r.ok).toBe(true)
    expect(r.notes.join(' ')).toMatch(/sparkly/)
    expect(r.forgiven.join(' ')).toMatch(/sparkly/)
    expect(tryItem(itemEntry('cube', "m.box(0.3, 0.3, 0.3, { color: 'red' })")).forgiven).toEqual([])
  })

  it('fails one too big, too small, empty or with too many shapes', () => {
    expect(tryItem(itemEntry('tower', 'm.box(1, 25, 1, { at: [0, 12.5, 0] })')).error).toMatch(/smaller than 16 m/)
    expect(tryItem(itemEntry('speck', 'm.box(0.01, 0.01, 0.01)')).error).toMatch(/at least/)
    expect(tryItem(itemEntry('nothing', 'return { carry: "hand" }')).error).toMatch(/no shapes/)
    expect(tryItem(itemEntry('fence', 'for (let i = 0; i < 300; i++) m.box(0.05, 0.5, 0.05, { at: [i * 0.04 - 6, 0.25, 0] })')).error).toMatch(/at most 250/)
  })

  it("runs its process for a second, and fails one that throws", () => {
    expect(tryItem(itemEntry('top', 'm.cylinder(0, 0.2, 0.3)', 'it.yaw += dt * 3')).error).toBeNull()
    const r = tryItem(itemEntry('top', 'm.cylinder(0, 0.2, 0.3)', 'if (w.t > 0.5) throw new Error("tick broke")'))
    expect(r.error).toMatch(/process/)
    expect(r.error).toMatch(/tick broke/)
  })

  it('runs the process of a thing that can be worn while it is worn too, and fails one that trips on that', () => {
    const wand = "m.cylinder(0.02, 0.02, 0.4, { at: [0, 0.2, 0], color: 'white' })\nreturn { carry: 'hand', wear: 'hand' }"
    expect(tryItem(itemEntry('wand', wand, 'it.yaw += dt * 3')).error).toBeNull()
    // A worn thing is in no list of the room's things.
    const r = tryItem(itemEntry('wand', wand, 'const me = w.items.find((i) => i.id === it.id)\nme.yaw += dt'))
    expect(r.error).toMatch(/the process, while worn/)
  })

  it('fails a process slower than the game lets one be', () => {
    let clock = 0
    const spy = vi.spyOn(performance, 'now').mockImplementation(() => (clock += 20))
    try {
      // Every look at the clock finds 20 ms gone: each frame's process seems to take 20 ms or more, past the 4 a frame it gets.
      expect(tryItem(itemEntry('top', 'm.cylinder(0, 0.2, 0.3)', 'it.yaw += dt * 3')).error).toMatch(/the process took \d+ ms in 60 frames/)
    } finally {
      spy.mockRestore()
    }
  })
})

describe('validating in a worker', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const req = (): ValidateRequest => ({ snapshot: world, entries: { items: [], actions: [] }, candidate: { kind: 'item', entry: itemEntry('cube', 'm.box(0.3, 0.3, 0.3)') } })

  /** A worker that answers with validate() in this thread, or never, or breaks. */
  function fakeWorker(mode: 'answer' | 'hang' | 'break') {
    const made: { terminated: boolean }[] = []
    class FakeWorker {
      onmessage: ((e: MessageEvent<ValidateResult>) => void) | null = null
      onerror: ((e: ErrorEvent) => void) | null = null
      terminated = false
      constructor() {
        made.push(this)
      }
      postMessage(r: ValidateRequest) {
        setTimeout(() => {
          if (this.terminated) return
          if (mode === 'answer') this.onmessage!({ data: validate(structuredClone(r)) } as MessageEvent<ValidateResult>)
          if (mode === 'break') this.onerror!({ message: 'Failed to load the module' } as ErrorEvent)
        }, 5)
      }
      terminate() {
        this.terminated = true
      }
    }
    vi.stubGlobal('Worker', FakeWorker)
    return made
  }

  it('answers through a fresh worker and ends it', async () => {
    const made = fakeWorker('answer')
    const r = await validateInWorker(req())
    expect(r.ok).toBe(true)
    expect(made).toHaveLength(1)
    expect(made[0]!.terminated).toBe(true)
  })

  it('gives up on a worker that hangs', async () => {
    const made = fakeWorker('hang')
    const r = await validateInWorker(req(), 50)
    expect(r).toMatchObject({ ok: false, error: 'it took too long: a loop that never waits?' })
    expect(made[0]!.terminated).toBe(true)
  })

  it('rejects when the worker cannot run at all', async () => {
    fakeWorker('break')
    await expect(validateInWorker(req())).rejects.toThrow('Failed to load the module')
  })
})
